import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('Connecting to PostgreSQL on aaPanel VPS...')
    
    // Attempting a simple query to verify connection
    const result = await prisma.$queryRaw`SELECT 1 as connected;`
    
    console.log('✅ Connection Successful!', result)
  } catch (error) {
    console.error('❌ Connection Failed:')
    console.error(error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
