import { HypersyncClient, type Query } from "@envio-dev/hypersync-client";

async function main() {
  // Create hypersync client using the mainnet hypersync endpoint
  const client = new HypersyncClient({
    url: "https://base-traces.hypersync.xyz/",
    apiToken: process.env.ENVIO_API_TOKEN!,
  });

  const query: Query = {
    fromBlock: 43014113,
    toBlock: 43033307,
    traces: [
      {
        to: ["0x88D19A03C429029901d917510f8f582D2E5F803B"],
      },
    ],
    fieldSelection: {
      block: ["Hash", "Number", "Timestamp"],
      trace: [
        "From",
        "To",
        "CallType",
        "Gas",
        "Input",
        "Value",
        "BlockNumber",
        "GasUsed",
        "TraceAddress",
        "TransactionHash",
        "TransactionPosition",
        "Type",
        "Error",
      ],
    },
  };

  const result = await client.get(query);
  const json = JSON.stringify(
    result,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );

  await Bun.write("raw.json", json);

  // Build a lookup from blockNumber -> timestamp
  const blockTimestamp = new Map<number, string>();
  for (const b of result.data.blocks ?? []) {
    if (b.number != null && b.timestamp != null) {
      blockTimestamp.set(Number(b.number), b.timestamp.toString());
    }
  }

  // Collect transaction hashes whose root call reverted
  const revertedTxs = new Set<string>();
  for (const t of result.data.traces ?? []) {
    if (t.error && (t.traceAddress ?? []).length === 0 && t.transactionHash) {
      revertedTxs.add(t.transactionHash);
    }
  }

  const internalTxs = (result.data.traces ?? [])
    .filter((t) => t.type === "call")
    .map((t) => {
      const traceAddress = t.traceAddress ?? [];
      const traceId = [t.transactionPosition, ...traceAddress].join("_");
      const isError = revertedTxs.has(t.transactionHash ?? "") ? "1" : "0";
      return {
        blockNumber: t.blockNumber?.toString() ?? "",
        timeStamp: blockTimestamp.get(Number(t.blockNumber)) ?? "",
        hash: t.transactionHash ?? "",
        from: t.from ?? "",
        to: t.to ?? "",
        value: typeof t.value === "bigint" ? t.value.toString() : (t.value ?? "0"),
        contractAddress: "",
        input: t.input && t.input !== "0x" ? t.input : "",
        type: t.callType ?? "",
        gas: typeof t.gas === "bigint" ? t.gas.toString() : (t.gas ?? ""),
        gasUsed: typeof t.gasUsed === "bigint" ? t.gasUsed.toString() : (t.gasUsed ?? ""),
        // traceId,
        // isError,
        errCode: t.error ?? "",
      };
    });

  await Bun.write(
    "internal_transactions.json",
    JSON.stringify(internalTxs, null, 2),
  );
}

main().catch(console.error);
