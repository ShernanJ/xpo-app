import type { ImgHTMLAttributes } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { ContentHubDialog } from "./ContentHubDialog";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

function createJsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function buildRelativeIso(dayOffset: number) {
  const date = new Date();
  date.setHours(10, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

function buildItem(args: {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdAt: string;
  content: string;
  publishedTweetId?: string | null;
  folderId?: string | null;
  folder?: {
    id: string;
    name: string;
    color: string | null;
    createdAt: string;
  } | null;
}) {
  return {
    id: args.id,
    title: args.title,
    sourcePrompt: `${args.title} prompt`,
    sourcePlaybook: null,
    outputShape: "short_form_post",
    threadId: "thread_1",
    messageId: `message_${args.id}`,
    status: args.status,
    reviewStatus: args.status === "PUBLISHED" ? "posted" : "pending",
    folderId: args.folderId ?? null,
    folder: args.folder ?? null,
    publishedTweetId: args.publishedTweetId ?? null,
    artifact: {
      id: `${args.id}-artifact`,
      title: args.title,
      kind: "short_form_post",
      content: args.content,
      posts: [
        {
          id: `${args.id}-post`,
          content: args.content,
          weightedCharacterCount: args.content.length,
          maxCharacterLimit: 280,
          isWithinXLimit: true,
        },
      ],
      characterCount: args.content.length,
      weightedCharacterCount: args.content.length,
      maxCharacterLimit: 280,
      isWithinXLimit: true,
      supportAsset: null,
      mediaAttachments: [],
      groundingSources: [],
      groundingMode: null,
      groundingExplanation: null,
      betterClosers: [],
      replyPlan: [],
      voiceTarget: null,
      noveltyNotes: [],
      threadFramingStyle: null,
    },
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
    postedAt: args.status === "PUBLISHED" ? args.createdAt : null,
  };
}

test("groups items by date and filters with the header search", async () => {
  const user = userEvent.setup();
  const fetchWorkspace = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/creator/v2/content") {
      return createJsonResponse({
        ok: true,
        data: {
          items: [
            buildItem({
              id: "draft_today",
              title: "Today draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Shipping the new modal today.",
            }),
            buildItem({
              id: "draft_yesterday",
              title: "Yesterday note",
              status: "PUBLISHED",
              createdAt: buildRelativeIso(-1),
              content: "Yesterday we finalized the post preview.",
              publishedTweetId: "1900001",
            }),
          ],
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folders: [],
        },
      });
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  render(
    <ContentHubDialog
      open
      onOpenChange={vi.fn()}
      fetchWorkspace={fetchWorkspace}
      initialHandle="standev"
      identity={{
        displayName: "Stanley",
        username: "standev",
        avatarUrl: null,
      }}
      isVerifiedAccount
    />,
  );

  expect(await screen.findByText("Today")).toBeVisible();
  expect(screen.getByText("Yesterday")).toBeVisible();
  expect(screen.getAllByText("Today draft").length).toBeGreaterThan(0);

  await user.type(screen.getByPlaceholderText("Search posts & threads"), "yesterday");

  await waitFor(() => {
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });
  expect(screen.getAllByText("Yesterday note").length).toBeGreaterThan(0);
});

test("moves a card between status columns with drag and drop", async () => {
  const user = userEvent.setup();
  const fetchWorkspace = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/creator/v2/content") {
      return createJsonResponse({
        ok: true,
        data: {
          items: [
            buildItem({
              id: "draft_board",
              title: "Board draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Status draft body",
            }),
          ],
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folders: [],
        },
      });
    }

    if (method === "PATCH" && url === "/api/creator/v2/content/draft_board") {
      return createJsonResponse({
        ok: true,
        data: {
          item: buildItem({
            id: "draft_board",
            title: "Board draft",
            status: "PUBLISHED",
            createdAt: buildRelativeIso(0),
            content: "Status draft body",
          }),
        },
      });
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  render(
    <ContentHubDialog
      open
      onOpenChange={vi.fn()}
      fetchWorkspace={fetchWorkspace}
      initialHandle="standev"
      identity={{
        displayName: "Stanley",
        username: "standev",
        avatarUrl: null,
      }}
      isVerifiedAccount
    />,
  );

  await screen.findByText("Board draft");
  await user.click(screen.getAllByRole("button", { name: /status/i })[0]);

  const draggableCard = screen
    .getAllByText("Status draft body")[0]
    .closest("[draggable='true']") as HTMLElement;
  const publishedColumn = screen
    .getAllByText("Published")
    .find((element) => element.closest("section"))
    ?.closest("section") as HTMLElement;

  fireEvent.dragStart(draggableCard);
  fireEvent.dragOver(publishedColumn);
  fireEvent.drop(publishedColumn);

  await waitFor(() => {
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/content/draft_board",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });
});

test("opens the source thread at the selected message", async () => {
  const fetchWorkspace = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/creator/v2/content") {
      return createJsonResponse({
        ok: true,
        data: {
          items: [
            buildItem({
              id: "draft_link",
              title: "Linked draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Linked draft body",
            }),
          ],
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folders: [],
        },
      });
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  render(
    <ContentHubDialog
      open
      onOpenChange={vi.fn()}
      fetchWorkspace={fetchWorkspace}
      initialHandle="standev"
      identity={{
        displayName: "Stanley",
        username: "standev",
        avatarUrl: null,
      }}
      isVerifiedAccount
    />,
  );

  const link = await screen.findByRole("link", { name: "Open in Chat" });
  expect(link).toHaveAttribute(
    "href",
    "/chat/thread_1?xHandle=standev&messageId=message_draft_link",
  );
});

test("creates folders and updates folder assignment from the preview pane", async () => {
  const user = userEvent.setup();
  const fetchWorkspace = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/creator/v2/content") {
      return createJsonResponse({
        ok: true,
        data: {
          items: [
            buildItem({
              id: "draft_folder",
              title: "Folder draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Folder draft body",
            }),
          ],
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folders: [
            {
              id: "folder_existing",
              name: "Launch",
              color: null,
              createdAt: buildRelativeIso(0),
            },
          ],
        },
      });
    }

    if (method === "POST" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folder: {
            id: "folder_new",
            name: "April Launch",
            color: "#27272a",
            createdAt: buildRelativeIso(0),
          },
        },
      });
    }

    if (method === "PATCH" && url === "/api/creator/v2/content/draft_folder") {
      return createJsonResponse({
        ok: true,
        data: {
          item: buildItem({
            id: "draft_folder",
            title: "Folder draft",
            status: "DRAFT",
            createdAt: buildRelativeIso(0),
            content: "Folder draft body",
            folderId: "folder_existing",
            folder: {
              id: "folder_existing",
              name: "Launch",
              color: null,
              createdAt: buildRelativeIso(0),
            },
          }),
        },
      });
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  render(
    <ContentHubDialog
      open
      onOpenChange={vi.fn()}
      fetchWorkspace={fetchWorkspace}
      initialHandle="standev"
      identity={{
        displayName: "Stanley",
        username: "standev",
        avatarUrl: null,
      }}
      isVerifiedAccount
    />,
  );

  await screen.findByText("Folder draft");
  await user.click(
    screen.getAllByText("Folder draft")[0].closest("button") as HTMLButtonElement,
  );

  await user.type(screen.getByPlaceholderText("Create folder"), "April Launch");
  await user.click(screen.getByRole("button", { name: /create folder/i }));

  expect(await screen.findByText(/Created folder "April Launch"/i)).toBeVisible();
  expect(screen.getByRole("option", { name: "April Launch" })).toBeVisible();

  await user.selectOptions(screen.getByRole("combobox"), "folder_existing");

  await waitFor(() => {
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/content/draft_folder",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });
});
