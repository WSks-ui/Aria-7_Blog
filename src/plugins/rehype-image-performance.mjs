import { fileURLToPath } from "node:url";

import { readPublicImageDimensions } from "../lib/images.ts";

const defaultPublicDirectory = fileURLToPath(new URL("../../public/", import.meta.url));

export default function rehypeImagePerformance({ publicDirectory = defaultPublicDirectory } = {}) {
  return async (tree) => {
    const imageNodes = [];

    const visit = (node) => {
      if (!node || typeof node !== "object") return;

      if (node.type === "element" && node.tagName === "img") {
        node.properties ??= {};
        node.properties.loading ??= "lazy";
        node.properties.decoding ??= "async";
        imageNodes.push(node);
      }

      node.children?.forEach(visit);
    };

    visit(tree);

    await Promise.all(
      imageNodes.map(async (node) => {
        const source = node.properties.src;
        if (typeof source !== "string") return;

        const dimensions = await readPublicImageDimensions(source, publicDirectory);
        if (!dimensions) return;

        node.properties.width ??= dimensions.width;
        node.properties.height ??= dimensions.height;
      }),
    );
  };
}
