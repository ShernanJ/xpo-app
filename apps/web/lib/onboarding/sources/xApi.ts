import { normalizeXAvatarUrl } from "../avatarUrl";
import type { XPublicPost, XPublicProfile } from "../types";

const X_API_BASE = "https://api.x.com/2";

interface XApiUserResponse {
  data?: {
    id: string;
    username: string;
    name: string;
    created_at?: string;
    description?: string;
    profile_image_url?: string;
    verified?: boolean;
    public_metrics?: {
      followers_count?: number;
      following_count?: number;
    };
  };
  errors?: Array<{ message?: string }>;
}

interface XApiTweetsResponse {
  data?: Array<{
    id: string;
    text: string;
    created_at?: string;
    public_metrics?: {
      like_count?: number;
      reply_count?: number;
      retweet_count?: number;
      quote_count?: number;
    };
  }>;
  errors?: Array<{ message?: string }>;
}

function getBearerToken(): string | null {
  const token = process.env.X_API_BEARER_TOKEN?.trim();
  return token ? token : null;
}

async function fetchFromX<T>(path: string): Promise<T> {
  const token = getBearerToken();
  if (!token) {
    throw new Error("X_API_BEARER_TOKEN is not configured.");
  }

  const response = await fetch(`${X_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`X API ${response.status}: ${text.slice(0, 200)}`);
  }

  return (await response.json()) as T;
}

export function hasXApiCredentials(): boolean {
  return Boolean(getBearerToken());
}

export async function fetchXPublicProfile(
  username: string,
): Promise<{ profile: XPublicProfile; userId: string }> {
  const result = await fetchFromX<XApiUserResponse>(
    `/users/by/username/${encodeURIComponent(
      username,
    )}?user.fields=created_at,description,public_metrics,verified`,
  );

  if (!result.data?.id) {
    const apiMessage = result.errors?.[0]?.message;
    throw new Error(apiMessage ?? "User not found in X API response.");
  }

  return {
    userId: result.data.id,
    profile: {
      username: result.data.username,
      name: result.data.name,
      bio: result.data.description ?? "",
      avatarUrl: normalizeXAvatarUrl(result.data.profile_image_url ?? null),
      isVerified: result.data.verified ?? false,
      followersCount: result.data.public_metrics?.followers_count ?? 0,
      followingCount: result.data.public_metrics?.following_count ?? 0,
      createdAt: result.data.created_at ?? new Date(0).toISOString(),
    },
  };
}

export async function fetchXRecentPosts(
  userId: string,
  maxResults = 50,
): Promise<XPublicPost[]> {
  const boundedMax = Math.max(5, Math.min(100, Math.floor(maxResults)));
  const result = await fetchFromX<XApiTweetsResponse>(
    `/users/${encodeURIComponent(
      userId,
    )}/tweets?exclude=retweets,replies&tweet.fields=created_at,public_metrics&max_results=${boundedMax}`,
  );

  return (result.data ?? []).map((tweet) => ({
    id: tweet.id,
    text: tweet.text ?? "",
    createdAt: tweet.created_at ?? new Date(0).toISOString(),
    metrics: {
      likeCount: tweet.public_metrics?.like_count ?? 0,
      replyCount: tweet.public_metrics?.reply_count ?? 0,
      repostCount: tweet.public_metrics?.retweet_count ?? 0,
      quoteCount: tweet.public_metrics?.quote_count ?? 0,
    },
  }));
}
