import prisma from "../lib/db/prisma";
import { hashPassword } from "../lib/auth/password";
import { generateSecureToken } from "../lib/auth/tokens";
import { generateAndStoreRecoveryCodes } from "../lib/auth/recovery";
import { setUserAuthMethods } from "../lib/auth/auth-methods";

async function main() {
  console.log("==================================================================");
  console.log(" MARKET INTELLIGENCE — INICJALIZACJA PIERWSZEGO ADMINISTRATORA   ");
  console.log("==================================================================");

  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (existingAdmin) {
    console.log(`[INFO] Administrator już istnieje w bazie: ${existingAdmin.email}`);
    console.log("Inicjalizacja nie jest wymagana.");
    return;
  }

  const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || "admin@market-intelligence.local").toLowerCase().trim();
  const initialPassword = `Admin_${generateSecureToken(8)}!`;
  const passwordHash = await hashPassword(initialPassword);

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      displayName: "Główny Administrator",
      role: "ADMIN",
      status: "ACTIVE",
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  // Włącz dozwolone metody: Password i Passkey
  await setUserAuthMethods(admin.id, {
    PASSWORD: true,
    PASSKEY: true,
    GOOGLE: false,
    APPLE: false,
    FACEBOOK: false,
  });

  // Wygeneruj kody awaryjne
  const recoveryCodes = await generateAndStoreRecoveryCodes(admin.id, 8);

  console.log(`\n[SUKCES] Utworzono konto pierwszego administratora!`);
  console.log(`Email:    ${adminEmail}`);
  console.log(`Hasło:    ${initialPassword}`);
  console.log(`Rola:     ADMIN`);
  console.log(`Status:   ACTIVE`);
  console.log(`\nJednorazowe kody recovery (zapisz je w bezpiecznym miejscu):`);
  recoveryCodes.forEach((c, idx) => console.log(`  ${idx + 1}. ${c}`));
  console.log("\nZaloguj się pod adresem /login i zarejestruj swój klucz Passkey.");
  console.log("==================================================================");
}

main()
  .catch((e) => {
    console.error("[SEED ERROR]:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
