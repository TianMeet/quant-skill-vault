import { PrismaClient } from '@prisma/client'
import { slugify } from '../src/lib/slugify'

const prisma = new PrismaClient()

const skills = [
  {
    title: 'Deduplicate News Articles',
    summary: 'removes duplicate news articles from a dataset based on similarity scoring',
    inputs: 'A list of news articles with title, content, and metadata',
    outputs: 'Deduplicated list with similarity scores and removal reasons',
    steps: [
      'Load the news article dataset',
      'Compute pairwise similarity using TF-IDF or embeddings',
      'Cluster articles above similarity threshold',
      'Select representative article from each cluster',
      'Output deduplicated list with audit trail',
    ],
    risks: 'May incorrectly merge articles about similar but distinct events. Threshold tuning is critical.',
    triggers: ['deduplicate news', 'remove duplicate articles', 'news dedup pipeline'],
    guardrails: {
      allowed_tools: ['Read', 'Write', 'Bash'],
      disable_model_invocation: false,
      user_invocable: true,
      stop_conditions: ['Stop if similarity threshold is not configured', 'Stop if input dataset is empty'],
      escalation: 'ASK_HUMAN',
    },
    tests: [
      {
        name: 'basic dedup',
        input: '[{title:"Breaking: Fire"}, {title:"Breaking: Fire in City"}]',
        expected_output: 'One article removed, similarity > 0.8',
      },
    ],
    tags: ['NLP', 'Data Cleaning'],
  },
  {
    title: 'Backtest Moving Average Strategy',
    summary: 'backtests a simple/exponential moving average crossover trading strategy on historical price data',
    inputs: 'Historical OHLCV price data, MA periods (fast/slow), and backtest parameters',
    outputs: 'Backtest report with PnL, Sharpe ratio, max drawdown, and trade log',
    steps: [
      'Load and validate historical price data',
      'Calculate fast and slow moving averages',
      'Generate buy/sell signals on crossover events',
      'Simulate trades with position sizing and slippage',
      'Calculate performance metrics (Sharpe, drawdown, win rate)',
    ],
    risks: 'Overfitting to historical data. Does not account for market impact or liquidity constraints.',
    triggers: ['backtest moving average', 'MA crossover strategy', 'test trading strategy'],
    guardrails: {
      allowed_tools: ['Read', 'Write'],
      disable_model_invocation: false,
      user_invocable: true,
      stop_conditions: ['Stop if price data has gaps > 5 trading days', 'Stop if MA periods are equal'],
      escalation: 'REVIEW',
    },
    tests: [
      {
        name: 'golden cross detection',
        input: 'fast_period=50, slow_period=200, data=SPY_2020',
        expected_output: 'At least 2 crossover signals detected',
      },
    ],
    tags: ['Quant', 'Backtesting'],
  },
  {
    title: 'Parse Financial PDF Reports',
    summary: 'extracts structured financial data from PDF annual reports and earnings releases',
    inputs: 'PDF file path or URL of a financial report',
    outputs: 'Structured JSON with revenue, expenses, net income, and key metrics',
    steps: [
      'Download or read the PDF file',
      'Extract text using OCR if needed',
      'Identify financial tables and key sections',
      'Parse numerical values with unit normalization',
      'Validate extracted data against known totals',
    ],
    risks: 'OCR errors on scanned documents. Table structure may vary across report formats.',
    triggers: ['parse financial PDF', 'extract earnings data', 'read annual report'],
    guardrails: {
      allowed_tools: ['Read', 'Bash'],
      disable_model_invocation: false,
      user_invocable: true,
      stop_conditions: ['Stop if PDF is password-protected', 'Stop if file exceeds 100MB'],
      escalation: 'BLOCK',
    },
    tests: [
      {
        name: 'revenue extraction',
        input: 'sample_10k.pdf',
        expected_output: 'revenue field present and > 0',
      },
    ],
    tags: ['NLP', 'Finance', 'Data Cleaning'],
  },
]

async function main() {
  console.log('Seeding database...')

  for (const skillData of skills) {
    const { tags: tagNames, ...rest } = skillData
    const slug = slugify(rest.title)

    // Upsert tags
    const tagRecords = await Promise.all(
      tagNames.map((name) =>
        prisma.tag.upsert({
          where: { name },
          update: {},
          create: { name },
        })
      )
    )

    // Create skill
    await prisma.skill.upsert({
      where: { slug },
      update: {
        ...rest,
        tags: {
          deleteMany: {},
          create: tagRecords.map((t:any) => ({ tagId: t.id })),
        },
      },
      create: {
        ...rest,
        slug,
        tags: {
          create: tagRecords.map((t:any) => ({ tagId: t.id })),
        },
      },
    })

    console.log(`  Seeded: ${rest.title} (${slug})`)
  }

  // Seed supporting files for the first skill
  const firstSkill = await prisma.skill.findUnique({ where: { slug: 'deduplicate-news-articles' } })
  if (firstSkill) {
    await prisma.skillFile.upsert({
      where: { skillId_path: { skillId: firstSkill.id, path: 'references/rules.md' } },
      update: {},
      create: {
        skillId: firstSkill.id,
        path: 'references/rules.md',
        mime: 'text/markdown',
        isBinary: false,
        contentText: '# Deduplication Rules\n\n- Similarity threshold: 0.8\n- Use cosine similarity on TF-IDF vectors\n- Keep the article with the earliest publish date\n',
      },
    })
    await prisma.skillFile.upsert({
      where: { skillId_path: { skillId: firstSkill.id, path: 'scripts/dedup.sql' } },
      update: {},
      create: {
        skillId: firstSkill.id,
        path: 'scripts/dedup.sql',
        mime: 'application/sql',
        isBinary: false,
        contentText: 'SELECT id, title, COUNT(*) as dupes\nFROM articles\nGROUP BY title\nHAVING dupes > 1;\n',
      },
    })
    console.log('  Seeded: supporting files for deduplicate-news-articles')
  }

  console.log('Seeding complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
