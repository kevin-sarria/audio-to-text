import { PrismaClient, AuthProvider, UserStatus } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando sembrado de base de datos...");

  const testEmail = "test@audiototext.local";
  const existingUser = await prisma.user.findUnique({
    where: { email: testEmail }
  });

  if (!existingUser) {
    const passwordHash = await argon2.hash("Password123!", {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash,
        authProvider: AuthProvider.LOCAL,
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            fullName: "Usuario de Prueba",
            preferences: { theme: "dark", language: "es" }
          }
        }
      }
    });

    console.log(`Usuario de prueba creado con ID: ${user.id}`);
  } else {
    console.log("El usuario de prueba ya existe.");
  }
}

main()
  .catch((e) => {
    console.error("Error durante el sembrado:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
