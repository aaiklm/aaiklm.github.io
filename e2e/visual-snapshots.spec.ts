import { test, expect } from "@playwright/test";

interface Story {
  id: string;
  title: string;
  name: string;
  kind: string;
}

interface StorybookIndex {
  v: number;
  entries: Record<string, Story>;
}

test.describe("Visual Snapshots", () => {
  let stories: Story[] = [];

  test.beforeAll(async ({ request }) => {
    // Fetch the Storybook index to get all stories
    const response = await request.get("/index.json");
    const index: StorybookIndex = await response.json();

    // Filter to only story entries (not docs)
    stories = Object.values(index.entries).filter(
      (entry) => entry.id && !entry.id.endsWith("--docs")
    );
  });

  test("capture all story snapshots", async ({ page }) => {
    for (const story of stories) {
      // Navigate to the story iframe
      await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);

      // Wait for the story to render
      await page.waitForSelector("#storybook-root");
      await page.waitForLoadState("networkidle");

      // Give components time to fully render (animations, fonts, etc.)
      await page.waitForTimeout(500);

      // Take a screenshot
      await expect(page).toHaveScreenshot(`${story.id}.png`, {
        fullPage: true,
        animations: "disabled",
      });
    }
  });
});
