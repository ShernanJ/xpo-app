import type { XPublicPost, XPublicProfile } from "./types";

interface MockAccountData {
  profile: XPublicProfile;
  posts: XPublicPost[];
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

function createPostText(index: number, rand: () => number): string {
  const templates = [
    "How to make better posts in 15 minutes a day.",
    "Unpopular opinion: consistency beats originality for growth.",
    "3 mistakes that keep small creators stuck:\n1. No hook\n2. No structure\n3. No loop",
    "What is your biggest challenge with X growth right now?",
    "I rewrote one post 5 times and engagement doubled.",
    "This framework helped me stop guessing.\n\n- score hook\n- tune length\n- run postmortem",
    "If you only fix one thing this week, fix your first line.",
    "Built a small workflow to track prediction vs outcome.\nhttps://example.com/workflow",
  ];

  const selected = templates[Math.floor(rand() * templates.length)] ?? templates[0];
  if (index % 7 === 0) {
    return `Day ${index}: ${selected}`;
  }
  return selected;
}

export function buildMockAccountData(account: string): MockAccountData {
  const normalized = account.replace(/^@/, "").toLowerCase();
  const seed = hashString(normalized);
  const rand = createSeededRandom(seed);

  const followersCount = 120 + Math.floor(rand() * 850);
  const followingCount = 150 + Math.floor(rand() * 600);
  const createdDaysAgo = 300 + Math.floor(rand() * 2000);
  const createdAt = new Date(
    Date.now() - createdDaysAgo * 24 * 60 * 60 * 1000,
  ).toISOString();

  const postCount = 30;
  const now = Date.now();
  const posts: XPublicPost[] = [];

  for (let i = 0; i < postCount; i += 1) {
    const daysAgo = postCount - i;
    const createdAtPost = new Date(
      now - daysAgo * 24 * 60 * 60 * 1000 - Math.floor(rand() * 6 * 60 * 60 * 1000),
    ).toISOString();

    const likeCount = Math.floor(4 + rand() * 60);
    const replyCount = Math.floor(rand() * 12);
    const repostCount = Math.floor(rand() * 20);
    const quoteCount = Math.floor(rand() * 8);

    posts.push({
      id: `mock_${normalized}_${i + 1}`,
      text: createPostText(i + 1, rand),
      createdAt: createdAtPost,
      metrics: {
        likeCount,
        replyCount,
        repostCount,
        quoteCount,
      },
    });
  }

  return {
    profile: {
      username: normalized,
      name: normalized,
      bio: "Building systems for consistent growth.",
      followersCount,
      followingCount,
      createdAt,
    },
    posts,
  };
}
