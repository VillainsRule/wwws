import { defineConfig } from 'tsdown';

export default defineConfig([
    {
        entry: ["src/**/*.ts"],
        format: "esm",
        fixedExtension: true,
        unbundle: true,
        dts: true,
    },
    {
        entry: ["src/**/*.ts"],
        format: "cjs",
        fixedExtension: true,
        unbundle: true,
    },
]);