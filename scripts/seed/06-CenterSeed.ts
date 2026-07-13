import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 06-CenterSeed.ts
 * Creates all 54 centers from MasChitGroup under Sathiyamangalam branch.
 * Source:  MasChitGroup (54 active centers)
 * Centers are linked to Areas and assigned to Staff (agents).
 *
 * IMPORTANT: Run 01..05 seeds first.
 * Run: npx ts-node scripts/seed/06-CenterSeed.ts
 */

// âœ… SATHYAMANGALAM branch ID â€” from VPS DB
const BRANCH_ID = 'b2a0f0a4-1a87-4ce8-8719-a30ac5fe01b3';

const CENTERS = [
  { code: 1, centerCode: "SAT0001", name: "ESWARI RAJIV GANDHI NAGAR", area: "ATHANI ROAD", centerTime: "6.30AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 6, agentStaffNo: "STF0009" },
  { code: 2, centerCode: "SAT0002", name: "SELVI IRUGALUR", area: "IRUGALUR", centerTime: "8.00AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 8, agentStaffNo: "STF0009" },
  { code: 3, centerCode: "SAT0003", name: "GURUNATHAL DASARIPALAYAM", area: "DASARIPALAYAM", centerTime: "8.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 4, centerCode: "SAT0004", name: "SRI VINOTHINI KADATHUR", area: "KADATHUR", centerTime: "7.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 7, agentStaffNo: "STF0009" },
  { code: 5, centerCode: "SAT0005", name: "PALANIYAMMAL GANTHIPURAM", area: "GANTHIPURAM", centerTime: "8.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 6, centerCode: "SAT0006", name: "SUGANYA UDAYAMARATHU MEDU", area: "UDAYAMARATHU MEDU", centerTime: "6.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 7, centerCode: "SAT0007", name: "KALPANA DG PUDUR", area: "ATHANI ROAD", centerTime: "7.30AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 8, centerCode: "SAT0008", name: "NANDHINI PALLIKUDAMPIRIVU", area: "PALLIKUDAMPIRIVU", centerTime: "6.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 9, centerCode: "SAT0009", name: "SANTHI SASTHIRI NAGAR", area: "SASTHIRI NAGAR", centerTime: "9.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 10, centerCode: "SAT0010", name: "KARPAGAM VADAVALLI", area: "VADAVALLI", centerTime: "7.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 11, centerCode: "SAT0011", name: "POONGKODI DHODDAMPALAYAM", area: "DHOODAMPALAYAM", centerTime: "8.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 12, centerCode: "SAT0012", name: "GEETHA NAMBIYUR", area: "NAMBIYUR", centerTime: "9.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 13, centerCode: "SAT0013", name: "KARTHIKA NAMBIYUR", area: "NAMBIYUR", centerTime: "9.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 14, centerCode: "SAT0014", name: "NANDHINI ANNANAGAR", area: "ANNNANAGAR", centerTime: "7.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 6, agentStaffNo: "STF0009" },
  { code: 15, centerCode: "SAT0015", name: "VANI SADUMUGAI", area: "SADUMUGAI", centerTime: "9.00 AM", repaymentType: "WEEKLY", disbursMode: "NEFT", totalMembers: 6, agentStaffNo: "STF0009" },
  { code: 16, centerCode: "SAT0016", name: "GOWRI RAMAPURAM", area: "RAMAPURAM", centerTime: "8.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 17, centerCode: "SAT0017", name: "KALPANADEVI GANDHI NAGAR", area: "GANDHI NAGAR", centerTime: "7.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 18, centerCode: "SAT0018", name: "GOWRI SADUMUGAI", area: "SADUMUGAI", centerTime: "7.15 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 19, centerCode: "SAT0019", name: "RAMYA KULLANAYAKANUR", area: "KULLANAYAKANUR", centerTime: "7.45 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 20, centerCode: "SAT0020", name: "SATHYA VARATHAMPALAYAM", area: "VARATHAMPALAYAM", centerTime: "8.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 21, centerCode: "SAT0021", name: "SHARMILA VADAKUPETTAI", area: "VADAKUPETTAI", centerTime: "8.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 22, centerCode: "SAT0022", name: "KARPAGAVALI BASUVAPALAYAM", area: "BASUVAPALAYAM", centerTime: "8.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 7, agentStaffNo: "STF0009" },
  { code: 23, centerCode: "SAT0023", name: "SEGNAZ PASUVAPALAYAM", area: "PASUVAPALAYAM", centerTime: "8.15 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 6, agentStaffNo: "STF0009" },
  { code: 24, centerCode: "SAT0024", name: "THANMOLI  G.H CENTER", area: "G.H CENTER", centerTime: "7.15 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 25, centerCode: "SAT0025", name: "SARALA CHIKKARASAMPALAYAM", area: "CHIKKARASAMPALAYAM", centerTime: "7.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 6, agentStaffNo: "STF0009" },
  { code: 26, centerCode: "SAT0026", name: "VANAJA PUDUPEERKADAVU", area: "PUDUPEERKADAVU", centerTime: "8.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 9, agentStaffNo: "STF0009" },
  { code: 27, centerCode: "SAT0027", name: "SHINI JEEVA NAGAR", area: "JEEVA NAGAR", centerTime: null, repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 6, agentStaffNo: "STF0010" },
  { code: 28, centerCode: "SAT0028", name: "SARANYA KASIPALAYAM", area: "KASIPALAYAM", centerTime: "6.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 29, centerCode: "SAT0029", name: "INDHURANI M.G.R NAGAR", area: "M.G.R NAGAR", centerTime: "7.45", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 8, agentStaffNo: "STF0009" },
  { code: 30, centerCode: "SAT0030", name: "JAYANTHI  AYEEPALAYAM", area: "AYEEPALAYAM", centerTime: "8.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 31, centerCode: "SAT0031", name: "NAGARATHNA RAJAN NAGAR", area: "RAJAN NAGAR", centerTime: "7.15 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 32, centerCode: "SAT0032", name: "RADHIKA SURIYA KATTU KALANI", area: "SURIYA KATTU KALANI", centerTime: "7.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 6, agentStaffNo: "STF0010" },
  { code: 33, centerCode: "SAT0033", name: "SANTHI BAGUTHAMPALAYAM", area: "BAGUTHAMPALAYAM", centerTime: "8.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 34, centerCode: "SAT0034", name: "SATHIYA IKKARAITHATHAPALLI", area: "IKKARAITHATHAPALLI", centerTime: "8.15 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 6, agentStaffNo: "STF0010" },
  { code: 35, centerCode: "SAT0035", name: "SELVI KOTTUVEERAMPALAYAM", area: "KOTTUVEERAMPALAYAM", centerTime: "9.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 36, centerCode: "SAT0036", name: "ABINAYA MUDUKKANDURAI", area: "MUDUKKANDURAI", centerTime: "8.15 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 37, centerCode: "SAT0037", name: "SAROJA ELLUR MEDU", area: "ELLUR MEDU", centerTime: "6.45 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 38, centerCode: "SAT0038", name: "SANDHIYA PINCHAMEDU", area: "PINCHAMEDU", centerTime: "7.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 6, agentStaffNo: "STF0010" },
  { code: 39, centerCode: "SAT0039", name: "VALARMATHI KARPURAKKADU", area: "KARPURAKKADU", centerTime: "7.15 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 6, agentStaffNo: "STF0010" },
  { code: 40, centerCode: "SAT0040", name: "SHENBAGAVALLI PERIYAKODIVERI", area: "PERIYAKODIVERI", centerTime: "7.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 41, centerCode: "SAT0041", name: "VASANTHAL KUTTAI METTUR", area: "KUTTAI METTUR", centerTime: "7.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 6, agentStaffNo: "STF0010" },
  { code: 42, centerCode: "SAT0042", name: "GIRIYAMMAL KOLINJANUR", area: "KOLINJANUR", centerTime: "6.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 43, centerCode: "SAT0043", name: "SARITHA KOLLUMETTU COLONY", area: "KOLLUMETTU COLONY", centerTime: "7.45 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 44, centerCode: "SAT0044", name: "TAMILSELVI KARATTUPALAYAM", area: "KARATTUPALAYAM", centerTime: "7.45 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 45, centerCode: "SAT0045", name: "KANNIYAMMAL KASIPALAYAM", area: "KASIPALAYAM", centerTime: "6.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 6, agentStaffNo: "STF0010" },
  { code: 46, centerCode: "SAT0046", name: "SELVI CHIKKARASAMPALAYAM", area: "CHIKKARASAMPALAYAM", centerTime: "7.00 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 47, centerCode: "SAT0047", name: "MANJULA IKKARAINEGAMAM", area: "IKKARAINEGAMAM", centerTime: "6.45 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 48, centerCode: "SAT0048", name: "MOHANA THATTAMPUDHUR", area: "THATTAMPUDHUR", centerTime: "6.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 49, centerCode: "SAT0049", name: "MAHESHWARI ARIYAPPAMPALAYAM", area: "ARIYAPPAMPALAYAM", centerTime: "9.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 50, centerCode: "SAT0050", name: "PARVATHI UTHANDIYUR", area: "UTHANDIYUR", centerTime: "9.30 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 51, centerCode: "SAT0051", name: "BHUVANESWAR KASIPALAYAM", area: "KASIPALAYAM", centerTime: "6.45 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
  { code: 52, centerCode: "SAT0052", name: "MEENA THATTAMPUDUR", area: "THATTAMPUDUR", centerTime: "6.45 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 53, centerCode: "SAT0053", name: "RAJESWARI DHODDAMPALAYAM", area: "DHODDAMPALAYAM", centerTime: "8.45 AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0009" },
  { code: 54, centerCode: "SAT0054", name: "AMSAVENI UPPUPALLAM", area: "UPPUPALLAM", centerTime: "7.30AM", repaymentType: "WEEKLY", disbursMode: "CASH", totalMembers: 5, agentStaffNo: "STF0010" },
];

async function main() {
  console.log('[CenterSeed] Starting...');
  console.log('  Branch ID:', BRANCH_ID);

  // Build area lookup: name -> id
  const areas = await prisma.area.findMany({ where: { branchId: BRANCH_ID } });
  const areaMap = new Map(areas.map(a => [a.name, a.id]));

  // Fetch ALL staff — some agents have NULL branchId in VPS DB so we can't filter by branch
  const staffList = await prisma.staff.findMany({});
  console.log(`  Found ${staffList.length} staff total in DB`);

  // Phone-based lookup (most reliable): MDB agentCode → phone → staff.id
  const AGENT_PHONES: Record<string, string> = {
    'STF0001': '9944533403', 'STF0002': '6383352231', 'STF0003': '7448889797',
    'STF0004': '6381194463', 'STF0005': '9080359113', 'STF0007': '7200473403',
    'STF0008': '8838587317', 'STF0009': '7708696683', 'STF0010': '8610319103',
  };
  const staffPhoneMap = new Map(staffList.map(s => [s.phone, s.id]));
  const staffNoMap    = new Map(staffList.map(s => [s.staffNo, s.id]));

  function getStaffId(staffNo: string): string | null {
    // Try staffNo first, then phone fallback
    return staffNoMap.get(staffNo)
      ?? staffPhoneMap.get(AGENT_PHONES[staffNo] ?? '')
      ?? null;
  }

  // Log which agents were found
  for (const [sno, phone] of Object.entries(AGENT_PHONES)) {
    const id = getStaffId(sno);
    console.log(`  Agent ${sno} (${phone}): ${id ? '✅ found' : '❌ NOT FOUND'}`);
  }

  let count = 0, skip = 0;
  for (const c of CENTERS) {
    const areaId = areaMap.get(c.area);
    if (!areaId) {
      console.warn(`  [SKIP] Area not found: ${c.area} for center ${c.name}`);
      skip++;
      continue;
    }
    const agentId = c.agentStaffNo ? getStaffId(c.agentStaffNo) : null;

    const center = await prisma.center.upsert({
      where: { areaId_name: { areaId, name: c.name } },
      update: { code: c.centerCode, employeeId: agentId }, // ← updates code + assigns employee
      create: {
        name:          c.name,
        code:          c.centerCode,
        centerTime:    c.centerTime,
        repaymentType: c.repaymentType,
        disbursMode:   c.disbursMode,
        totalMembers:  c.totalMembers,
        areaId,
        employeeId:    agentId,
      },
    });
    console.log(`  Center [${c.code}]: ${center.name} | area: ${c.area} | id: ${center.id}`);
    count++;
  }

  console.log(`[CenterSeed] âœ… Done â€” ${count} centers seeded, ${skip} skipped`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
