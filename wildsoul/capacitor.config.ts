import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.vesperglen.hollowvale", // provisional: verify name / package ID before release
  appName: "Vesperglen",
  webDir: "dist",
  android: { backgroundColor: "#0b282c", allowMixedContent: false },
};
export default config;
