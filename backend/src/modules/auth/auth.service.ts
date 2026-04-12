import bcrypt from "bcrypt";
import { OAuth2Client } from "google-auth-library";

import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { createDefaultCategoriesForUser } from "../categories/category-defaults";
import { createDefaultPaymentMethodForUser } from "../payment-methods/payment-methods.service";
import { GoogleLoginInput, LoginInput, RegisterInput } from "./auth.validation";

const googleClient = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

export async function registerUser(input: RegisterInput) {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new Error("An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      preferredCurrency: "USD",
    },
  });

  await createDefaultCategoriesForUser(user.id);
  await createDefaultPaymentMethodForUser(user.id);

  const [categories, paymentMethods] = await Promise.all([
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
    }),
    prisma.paymentMethod.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    user,
    categories,
    paymentMethods,
  };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  return user;
}

export async function loginWithGoogle(input: GoogleLoginInput) {
  if (!env.googleClientId || !googleClient) {
    throw new Error("Google login is not configured");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: input.idToken,
    audience: env.googleClientId,
  });

  const payload = ticket.getPayload();

  if (!payload?.email || !payload.email_verified) {
    throw new Error("Google account email could not be verified");
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  let categories = await prisma.category.findMany({
    where: { userId: user?.id ?? "" },
    orderBy: { name: "asc" },
  });

  let paymentMethods = await prisma.paymentMethod.findMany({
    where: { userId: user?.id ?? "" },
    orderBy: { name: "asc" },
  });

  if (!user) {
    const generatedPasswordHash = await bcrypt.hash(`google:${payload.sub}:${Date.now()}`, 10);

    user = await prisma.user.create({
      data: {
        name: payload.name?.trim() || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        passwordHash: generatedPasswordHash,
        preferredCurrency: "CAD",
      },
    });

    await createDefaultCategoriesForUser(user.id);
    await createDefaultPaymentMethodForUser(user.id);

    [categories, paymentMethods] = await Promise.all([
      prisma.category.findMany({
        where: { userId: user.id },
        orderBy: { name: "asc" },
      }),
      prisma.paymentMethod.findMany({
        where: { userId: user.id },
        orderBy: { name: "asc" },
      }),
    ]);
  } else {
    if (!user.name && payload.name?.trim()) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: payload.name.trim() },
      });
    }

    [categories, paymentMethods] = await Promise.all([
      prisma.category.findMany({
        where: { userId: user.id },
        orderBy: { name: "asc" },
      }),
      prisma.paymentMethod.findMany({
        where: { userId: user.id },
        orderBy: { name: "asc" },
      }),
    ]);
  }

  return {
    user,
    categories,
    paymentMethods,
  };
}

export async function getCurrentUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      preferredCurrency: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
