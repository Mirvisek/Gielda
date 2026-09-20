import prisma from "@/lib/db/prisma";
import { AuthMethod, Prisma, UserRole, UserStatus } from "@prisma/client";
import { generateSecureToken, hashToken } from "@/lib/auth/tokens";
import { recordAuditLog } from "./audit-service";

export interface CreateUserInput {
  email: string;
  displayName: string;
  role?: UserRole;
  allowedMethods: Record<AuthMethod, boolean>;
}

/**
 * 1. Atomowe tworzenie użytkownika w statusie INVITED z tokenem aktywacyjnym i audytem.
 */
export async function createUser(input: CreateUserInput, actorAdminId: string) {
  const normalizedEmail = input.email.trim().toLowerCase();

  // Sprawdzenie, czy użytkownik z tym adresem już istnieje
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    throw new Error("Użytkownik z tym adresem e-mail już istnieje w systemie.");
  }

  // Generowanie losowego tokenu CSPRNG i jego skrótu SHA-256
  const rawActivationToken = generateSecureToken(32);
  const tokenHash = hashToken(rawActivationToken);
  const activationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 godzin

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const activationUrl = `${appUrl}/activate?token=${rawActivationToken}`;

  // Transakcja: Utworzenie usera + dozwolonych metod + wpis audytowy
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        displayName: input.displayName.trim(),
        role: input.role || UserRole.USER,
        status: UserStatus.INVITED,
        activationTokenHash: tokenHash,
        activationExpiresAt,
      },
    });

    // Utworzenie dozwolonych metod logowania
    const methodsToCreate = Object.entries(input.allowedMethods).map(([method, enabled]) => ({
      userId: newUser.id,
      method: method as AuthMethod,
      enabled,
    }));

    await tx.userAuthMethod.createMany({
      data: methodsToCreate,
    });

    return newUser;
  });

  await recordAuditLog({
    actorUserId: actorAdminId,
    action: "ADMIN_USER_CREATED",
    targetType: "USER",
    targetId: user.id,
    metadata: { email: user.email, role: user.role, allowedMethods: input.allowedMethods },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
    },
    rawActivationToken,
    activationUrl,
  };
}

/**
 * 2. Zmiana statusu użytkownika (SUSPENDED, LOCKED, DISABLED, DELETED, ACTIVE)
 * z automatycznym unieważnieniem sesji i ochroną konta administratora.
 */
export async function changeUserStatus(
  targetUserId: string,
  newStatus: UserStatus,
  actorAdminId: string
) {
  // Ochrona 1: Administrator nie może zdeaktywować ani usunąć własnego konta
  if (targetUserId === actorAdminId && newStatus !== UserStatus.ACTIVE) {
    throw new Error("Odmowa operacji: Nie możesz zablokować, zawiesić ani usunąć własnego konta.");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!targetUser) {
    throw new Error("Użytkownik nie został odnaleziony.");
  }

  // Ochrona 2: Nie można usunąć ani zablokować ostatniego aktywnego administratora
  if (targetUser.role === UserRole.ADMIN && newStatus !== UserStatus.ACTIVE) {
    const remainingAdmins = await prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        id: { not: targetUserId },
      },
    });

    if (remainingAdmins === 0) {
      throw new Error(
        "Odmowa operacji: Nie można wyłączyć ani usunąć ostatniego aktywnego administratora w systemie."
      );
    }
  }

  // Aktualizacja statusu
  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: { status: newStatus },
  });

  // Jeśli status powoduje utratę dostępu (SUSPENDED, LOCKED, DISABLED, DELETED), unieważnij wszystkie aktywne sesje natychmiast!
  let revokedSessionsCount = 0;
  if (newStatus !== UserStatus.ACTIVE) {
    const res = await prisma.session.updateMany({
      where: {
        userId: targetUserId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    revokedSessionsCount = res.count;
  }

  await recordAuditLog({
    actorUserId: actorAdminId,
    action: "ADMIN_USER_STATUS_CHANGED",
    targetType: "USER",
    targetId: targetUserId,
    metadata: {
      oldStatus: targetUser.status,
      newStatus,
      revokedSessionsCount,
    },
  });

  return { updatedUser, revokedSessionsCount };
}

/**
 * 3. Zmiana dozwolonych metod uwierzytelniania użytkownika.
 */
export async function updateUserAuthMethods(
  targetUserId: string,
  allowedMethods: Record<AuthMethod, boolean>,
  actorAdminId: string
) {
  const operations = Object.entries(allowedMethods).map(([method, enabled]) =>
    prisma.userAuthMethod.upsert({
      where: {
        userId_method: {
          userId: targetUserId,
          method: method as AuthMethod,
        },
      },
      update: { enabled },
      create: {
        userId: targetUserId,
        method: method as AuthMethod,
        enabled,
      },
    })
  );

  await prisma.$transaction(operations);

  await recordAuditLog({
    actorUserId: actorAdminId,
    action: "ADMIN_AUTH_METHODS_UPDATED",
    targetType: "AUTH_METHOD",
    targetId: targetUserId,
    metadata: { allowedMethods },
  });
}

/**
 * 4. Ponowne wygenerowanie tokenu aktywacyjnego dla użytkownika w statusie INVITED.
 */
export async function resendActivationToken(targetUserId: string, actorAdminId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user || user.status !== UserStatus.INVITED) {
    throw new Error("Token aktywacyjny można wygenerować wyłącznie dla kont w statusie INVITED.");
  }

  const rawActivationToken = generateSecureToken(32);
  const tokenHash = hashToken(rawActivationToken);
  const activationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      activationTokenHash: tokenHash,
      activationExpiresAt,
    },
  });

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const activationUrl = `${appUrl}/activate?token=${rawActivationToken}`;

  await recordAuditLog({
    actorUserId: actorAdminId,
    action: "ADMIN_ACTIVATION_RESENT",
    targetType: "USER",
    targetId: targetUserId,
  });

  return { rawActivationToken, activationUrl };
}

/**
 * 5. Pobranie listy użytkowników z filtrowaniem i informacjami o sesjach i kluczach.
 */
export async function listUsers(query?: { status?: UserStatus; role?: UserRole; search?: string }) {
  const where: Prisma.UserWhereInput = {};

  if (query?.status) where.status = query.status;
  if (query?.role) where.role = query.role;
  if (query?.search) {
    where.OR = [
      { email: { contains: query.search } },
      { displayName: { contains: query.search } },
    ];
  }

  return await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      authMethods: {
        select: {
          method: true,
          enabled: true,
        },
      },
      _count: {
        select: {
          sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } },
          passkeys: true,
        },
      },
    },
  });
}

/**
 * 6. Szczegóły użytkownika dla panelu administratora.
 */
export async function getUserDetails(targetUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: {
      authMethods: true,
      passkeys: {
        select: {
          id: true,
          name: true,
          deviceType: true,
          createdAt: true,
          lastUsedAt: true,
          credentialId: true,
          // Klucz publiczny i counter nie są eksponowane w celach bezpieczeństwa
        },
      },
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: "desc" },
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          deviceId: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
        },
      },
      oauthAccounts: {
        select: {
          provider: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("Użytkownik nie został odnaleziony.");
  }

  return user;
}
