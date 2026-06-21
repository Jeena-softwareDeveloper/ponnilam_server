const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("AuditLogs:", await prisma.auditLog.findMany({ where: { action: "FORGOT_PASSWORD_REQUEST" } }));
  console.log("Notifications:", await prisma.notification.findMany({ where: { type: "PASSWORD_RESET" } }));
}

main().catch(console.error).finally(() => prisma.$disconnect());
