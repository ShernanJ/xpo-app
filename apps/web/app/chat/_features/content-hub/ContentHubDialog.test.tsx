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

function createBrokenJsonResponse(status = 500) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  });
}

function buildRelativeIso(dayOffset: number) {
  const date = new Date();
  date.setHours(10, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

function buildFolder(args: {
  id: string;
  name: string;
  itemCount?: number;
}) {
  return {
    id: args.id,
    name: args.name,
    color: null,
    createdAt: buildRelativeIso(0),
    itemCount: args.itemCount ?? 0,
  };
}

function buildItem(args: {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdAt: string;
  content: string;
  publishedTweetId?: string | null;
  folderId?: string | null;
  folder?: ReturnType<typeof buildFolder> | null;
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

async function openBrowseMode(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getAllByRole("button", { name: label })[0]);
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

  await user.type(screen.getByPlaceholderText("Search posts & threads"), "yesterday");

  await waitFor(() => {
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });
  expect(screen.getAllByText("Yesterday note").length).toBeGreaterThan(0);
});

test("shows a friendly error when the content response body is empty", async () => {
  const fetchWorkspace = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/creator/v2/content") {
      return createBrokenJsonResponse(500);
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

  expect(await screen.findByText("Failed to load content items.")).toBeVisible();
});

test("renders date, status, and group browse modes and orders group sections with No Group first", async () => {
  const user = userEvent.setup();
  const alphaGroup = buildFolder({ id: "group_alpha", name: "Alpha", itemCount: 1 });
  const zuluGroup = buildFolder({ id: "group_zulu", name: "Zulu", itemCount: 1 });
  const fetchWorkspace = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/creator/v2/content") {
      return createJsonResponse({
        ok: true,
        data: {
          items: [
            buildItem({
              id: "draft_ungrouped",
              title: "Ungrouped draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "No group content",
            }),
            buildItem({
              id: "draft_alpha",
              title: "Alpha draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Alpha content",
              folderId: alphaGroup.id,
              folder: alphaGroup,
            }),
            buildItem({
              id: "draft_zulu",
              title: "Zulu draft",
              status: "PUBLISHED",
              createdAt: buildRelativeIso(-1),
              content: "Zulu content",
              folderId: zuluGroup.id,
              folder: zuluGroup,
            }),
          ],
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folders: [zuluGroup, alphaGroup],
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

  expect(await screen.findByText("Ungrouped draft")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Date" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "Status" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "Group" }).length).toBeGreaterThan(0);

  await openBrowseMode(user, "Group");

  const noGroupLabel = screen.getAllByText("No Group")[0];
  const alphaLabel = screen.getAllByText("Alpha")[0];
  const zuluLabel = screen.getAllByText("Zulu")[0];

  expect(noGroupLabel.compareDocumentPosition(alphaLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(alphaLabel.compareDocumentPosition(zuluLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getAllByText("Alpha draft").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Zulu draft").length).toBeGreaterThan(0);
});

test("keeps the search bar and browse-mode controls visible after selecting a preview item", async () => {
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
              id: "draft_header",
              title: "Header draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Header controls should stay visible.",
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

  expect(await screen.findByText("Header draft")).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Header draft/i }));

  expect(screen.getByPlaceholderText("Search posts & threads")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Date" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "Status" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "Group" }).length).toBeGreaterThan(0);
});

test("renders a single mobile back action in the header while previewing a draft", async () => {
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
              id: "draft_mobile_header",
              title: "Mobile header draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Keep the mobile back action in the dialog header.",
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

  expect(await screen.findByText("Mobile header draft")).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Mobile header draft/i }));

  expect(screen.getAllByRole("button", { name: "Back to content list" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Close posts and threads" })).toHaveLength(2);
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
  await openBrowseMode(user, "Status");

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

test("updates status from the compact preview dropdown", async () => {
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
              id: "draft_status",
              title: "Status draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Status dropdown body",
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

    if (method === "PATCH" && url === "/api/creator/v2/content/draft_status") {
      return createJsonResponse({
        ok: true,
        data: {
          item: buildItem({
            id: "draft_status",
            title: "Status draft",
            status: "ARCHIVED",
            createdAt: buildRelativeIso(0),
            content: "Status dropdown body",
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

  expect(await screen.findByText("Status draft")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: /Status draft/i }),
  );
  expect(screen.getByLabelText("Status:")).toBeVisible();
  expect(screen.getByLabelText("Group:")).toBeVisible();

  await user.selectOptions(screen.getByLabelText("Status:"), "ARCHIVED");

  await waitFor(() => {
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/content/draft_status",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });

  expect(screen.queryByText("Status updated.")).not.toBeInTheDocument();
});

test("updates group from the compact preview dropdown without showing a success notice", async () => {
  const user = userEvent.setup();
  const existingGroup = buildFolder({ id: "group_existing", name: "Launch", itemCount: 0 });
  const nextGroup = buildFolder({ id: "group_next", name: "Growth", itemCount: 1 });
  const fetchWorkspace = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/creator/v2/content") {
      return createJsonResponse({
        ok: true,
        data: {
          items: [
            buildItem({
              id: "draft_group_update",
              title: "Group update draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Update the assigned group.",
            }),
          ],
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folders: [existingGroup, nextGroup],
        },
      });
    }

    if (method === "PATCH" && url === "/api/creator/v2/content/draft_group_update") {
      return createJsonResponse({
        ok: true,
        data: {
          item: buildItem({
            id: "draft_group_update",
            title: "Group update draft",
            status: "DRAFT",
            createdAt: buildRelativeIso(0),
            content: "Update the assigned group.",
            folderId: nextGroup.id,
            folder: nextGroup,
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

  expect(await screen.findByText("Group update draft")).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Group update draft/i }));
  await user.selectOptions(screen.getByLabelText("Group:"), nextGroup.id);

  await waitFor(() => {
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/content/draft_group_update",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });

  expect(screen.queryByText("Group updated.")).not.toBeInTheDocument();
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

test("creates a new group from the dropdown and assigns it to the selected item", async () => {
  const user = userEvent.setup();
  const existingGroup = buildFolder({ id: "folder_existing", name: "Launch", itemCount: 1 });
  const newGroup = buildFolder({ id: "folder_new", name: "April Launch", itemCount: 0 });
  const fetchWorkspace = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/creator/v2/content") {
      return createJsonResponse({
        ok: true,
        data: {
          items: [
            buildItem({
              id: "draft_group",
              title: "Group draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Group draft body",
            }),
          ],
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folders: [existingGroup],
        },
      });
    }

    if (method === "POST" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folder: newGroup,
        },
      });
    }

    if (method === "PATCH" && url === "/api/creator/v2/content/draft_group") {
      return createJsonResponse({
        ok: true,
        data: {
          item: buildItem({
            id: "draft_group",
            title: "Group draft",
            status: "DRAFT",
            createdAt: buildRelativeIso(0),
            content: "Group draft body",
            folderId: newGroup.id,
            folder: { ...newGroup, itemCount: 1 },
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

  expect(await screen.findByText("Group draft")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: /Group draft/i }),
  );

  await user.selectOptions(screen.getByLabelText("Group:"), "__add_new_group__");
  expect(await screen.findByRole("dialog", { name: "Add Group" })).toBeVisible();

  await user.type(screen.getByLabelText("Group name"), "April Launch");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/folders",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/content/draft_group",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });

  expect(
    screen.queryByText('Created group "April Launch" and assigned it.'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "April Launch" })).toBeVisible();
});

test("renames a group from the manage groups dialog and updates the loaded item", async () => {
  const user = userEvent.setup();
  const originalGroup = buildFolder({ id: "folder_existing", name: "Launch", itemCount: 2 });
  const renamedGroup = buildFolder({ id: "folder_existing", name: "Renamed Launch", itemCount: 2 });
  const fetchWorkspace = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/creator/v2/content") {
      return createJsonResponse({
        ok: true,
        data: {
          items: [
            buildItem({
              id: "draft_rename_group",
              title: "Rename draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Rename group body",
              folderId: originalGroup.id,
              folder: originalGroup,
            }),
          ],
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folders: [originalGroup],
        },
      });
    }

    if (method === "PATCH" && url === "/api/creator/v2/folders/folder_existing") {
      return createJsonResponse({
        ok: true,
        data: {
          folder: renamedGroup,
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

  expect(await screen.findByText("Rename draft")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: /Rename draft/i }),
  );

  await user.click(screen.getByRole("button", { name: "Manage Groups" }));
  expect(await screen.findByRole("dialog", { name: "Manage Groups" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Rename" }));
  const renameInput = screen.getByLabelText("Rename group");
  await user.clear(renameInput);
  await user.type(renameInput, "Renamed Launch");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/folders/folder_existing",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });

  expect(
    screen.queryByText('Renamed group to "Renamed Launch".'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Renamed Launch" })).toBeVisible();
});

test("deletes a group from the manage groups dialog and clears selected items back to No Group", async () => {
  const user = userEvent.setup();
  const existingGroup = buildFolder({ id: "folder_existing", name: "Launch", itemCount: 3 });
  const fetchWorkspace = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/creator/v2/content") {
      return createJsonResponse({
        ok: true,
        data: {
          items: [
            buildItem({
              id: "draft_delete_group",
              title: "Delete group draft",
              status: "DRAFT",
              createdAt: buildRelativeIso(0),
              content: "Delete group body",
              folderId: existingGroup.id,
              folder: existingGroup,
            }),
          ],
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folders: [existingGroup],
        },
      });
    }

    if (method === "DELETE" && url === "/api/creator/v2/folders/folder_existing") {
      return createJsonResponse({
        ok: true,
        data: {
          folder: {
            id: existingGroup.id,
            name: existingGroup.name,
            itemCount: existingGroup.itemCount,
          },
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

  expect(await screen.findByText("Delete group draft")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: /Delete group draft/i }),
  );

  await user.click(screen.getByRole("button", { name: "Manage Groups" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await user.click(screen.getByRole("button", { name: "Delete Group" }));

  await waitFor(() => {
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/folders/folder_existing",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });

  expect(
    screen.queryByText('Deleted group "Launch". 3 posts/threads moved to No Group.'),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Group:")).toHaveValue("");
  expect(screen.queryByRole("option", { name: "Launch" })).not.toBeInTheDocument();
});
