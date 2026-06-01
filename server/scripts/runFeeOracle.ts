import { feeOracle } from "../src/services/feeOracle";

(async () => {
  try {
    const res = await feeOracle.estimate("stellar", 2);
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("Error running fee oracle:", err);
    process.exit(1);
  }
})();
