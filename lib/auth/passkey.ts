import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import prisma from "@/lib/db/prisma";
import { saveChallenge, consumeChallenge } from "./tokens";
import { isAuthMethodAllowed } from "./auth-methods";
import { logSecurityEvent } from "@/lib/security/security-event";

export const getRPConfig = () => {
  return {
    rpName: process.env.WEBAUTHN_RP_NAME || "Market Intelligence",
    rpID: process.env.WEBAUTHN_RP_ID || "localhost",
    origin: process.env.WEBAUTHN_ORIGIN || "http://localhost:3000",
  };
};

/**
 * 1. Generuje opcje rejestracji nowego klucza Passkey dla uwierzytelnionego użytkownika.
 */
export async function createPasskeyRegistrationOptions(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { passkeys: true },
  });

  if (!user || user.status !== "ACTIVE") {
    throw new Error("Konto nie jest aktywne.");
  }

  const { rpName, rpID } = getRPConfig();

  // Wyklucz już zarejestrowane poświadczenia tego użytkownika
  const excludeCredentials = user.passkeys.map((p) => ({
    id: p.credentialId,
    transports: (p.transports ? p.transports.split(",") : []) as AuthenticatorTransportFuture[],
  }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: Buffer.from(user.id),
    userName: user.email,
    userDisplayName: user.displayName,
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  // Zapisz krótkotrwałe jednorazowe wyzwanie (5 minut)
  await saveChallenge(`passkey_reg:${userId}`, options.challenge, 300);

  return options;
}

/**
 * 2. Weryfikuje odpowiedź rejestracji Passkey i zapisuje klucz publiczny w bazie MariaDB.
 */
export async function verifyPasskeyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  deviceName: string = "Passkey Device"
) {
  const expectedChallenge = await consumeChallenge(`passkey_reg:${userId}`);
  if (!expectedChallenge) {
    throw new Error("Wyzwanie wygasło lub jest nieprawidłowe. Spróbuj ponownie.");
  }

  const { origin, rpID } = getRPConfig();

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Weryfikacja klucza Passkey nie powiodła się.");
  }

  const { credential, credentialDeviceType } = verification.registrationInfo;

  // Zapisz poświadczenie w bazie MariaDB
  const passkey = await prisma.passkey.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: BigInt(credential.counter),
      deviceType: credentialDeviceType,
      transports: credential.transports ? credential.transports.join(",") : null,
      name: deviceName.slice(0, 100),
    },
  });

  // Włącz metodę PASSKEY w `user_auth_methods` jeśli jeszcze nie włączona
  await prisma.userAuthMethod.upsert({
    where: {
      userId_method: {
        userId,
        method: "PASSKEY",
      },
    },
    update: { enabled: true },
    create: {
      userId,
      method: "PASSKEY",
      enabled: true,
    },
  });

  await logSecurityEvent({
    userId,
    eventType: "PASSKEY_REGISTERED",
    success: true,
    metadata: { passkeyId: passkey.id, deviceType: credentialDeviceType, name: passkey.name },
  });

  return passkey;
}

/**
 * 3. Generuje opcje uwierzytelnienia Passkey (logowania).
 * Obsługuje logowanie jednoetapowe (Discoverable Credentials / Resident Keys).
 */
export async function createPasskeyAuthenticationOptions(challengeKey: string) {
  const { rpID } = getRPConfig();

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });

  await saveChallenge(`passkey_auth:${challengeKey}`, options.challenge, 300);

  return options;
}

/**
 * 4. Weryfikuje odpowiedź logowania Passkey, waliduje counter i zwraca użytkownika.
 */
export async function verifyPasskeyAuthentication(
  challengeKey: string,
  response: AuthenticationResponseJSON
) {
  const expectedChallenge = await consumeChallenge(`passkey_auth:${challengeKey}`);
  if (!expectedChallenge) {
    throw new Error("Wyzwanie wygasło lub jest nieprawidłowe.");
  }

  // Odszukaj Passkey w bazie MariaDB
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: response.id },
    include: { user: true },
  });

  if (!passkey || !passkey.user) {
    throw new Error("Klucz Passkey nie został rozpoznany lub brak powiązanego konta.");
  }

  if (passkey.user.status !== "ACTIVE") {
    throw new Error("Konto użytkownika jest nieaktywne.");
  }

  // Sprawdź, czy administrator zezwolił na metodę PASSKEY dla tego konta
  const isAllowed = await isAuthMethodAllowed(passkey.userId, "PASSKEY");
  if (!isAllowed) {
    throw new Error("Logowanie za pomocą Passkey nie jest dozwolone dla tego konta.");
  }

  const { origin, rpID } = getRPConfig();

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, "base64url"),
      counter: Number(passkey.counter),
      transports: (passkey.transports ? passkey.transports.split(",") : []) as AuthenticatorTransportFuture[],
    },
    requireUserVerification: false,
  });

  if (!verification.verified) {
    throw new Error("Uwierzytelnienie Passkey nie powiodło się.");
  }

  // Aktualizacja licznika i czasu ostatniego użycia
  const newCounter = verification.authenticationInfo.newCounter;
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      counter: BigInt(newCounter),
      lastUsedAt: new Date(),
    },
  });

  await logSecurityEvent({
    userId: passkey.userId,
    eventType: "PASSKEY_USED",
    success: true,
    metadata: { passkeyId: passkey.id, credentialId: passkey.credentialId },
  });

  return passkey.user;
}
