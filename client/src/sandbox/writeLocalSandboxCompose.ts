import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildLocalSandboxCompose, getSandboxComposePath } from "./localSandboxCompose";

const outputPath = getSandboxComposePath();
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, buildLocalSandboxCompose(), "utf8");

console.log(`Wrote ${outputPath}`);
