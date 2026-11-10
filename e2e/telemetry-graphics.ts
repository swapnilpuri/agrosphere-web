import { expect, Page } from '@playwright/test';

/** Wait for the actual GPU frame, not only the checkbox's DOM update. */
export async function expectCurrentTint(page: Page) {
  await expect
    .poll(
      async () => {
        const png = await page.locator('.cesium-widget canvas').screenshot();
        return page.evaluate(
          async (url) => {
            const picture = new Image();
            picture.src = url;
            await picture.decode();
            const canvas = document.createElement('canvas');
            canvas.width = picture.width;
            canvas.height = picture.height;
            const context = canvas.getContext('2d')!;
            context.drawImage(picture, 0, 0);
            const [red, , blue] = context.getImageData(
              Math.floor(picture.width / 2),
              Math.floor(picture.height / 2),
              1,
              1,
            ).data;
            return blue > 120 && blue > red * 1.4;
          },
          'data:image/png;base64,' + png.toString('base64'),
        );
      },
      { timeout: 15000, message: 'Selected block must render the blue CURRENT fill' },
    )
    .toBe(true);
}
