/** 回归自检：sanitizeDebateLine 清洗争吵台词（旁白/前缀/复读） */
import { sanitizeDebateLine } from "../src/core/triune.js";

const cases: [string, string][] = [
  ["（挑眉咧嘴）\n自由？我说了算。", "自由？我说了算。"],
  ["本我：（吹口哨）馋就是馋。\n\n超我：（抱臂）馋也得有度。", "馋也得有度。"],
  ["超我：管得住自己才叫自由。", "管得住自己才叫自由。"],
  ["正常一句话，没旁白。", "正常一句话，没旁白。"],
  ["（把手机往枕头边一摊，冲超我吹个口哨）\n熬夜？那叫讨债。", "熬夜？那叫讨债。"],
];
let pass = 0;
for (const [inp, want] of cases) {
  const got = sanitizeDebateLine(inp);
  if (got === want) pass++;
  else console.log("FAIL in=" + JSON.stringify(inp) + " got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
}
console.log(`${pass}/${cases.length} sanitize PASS`);
if (pass !== cases.length) process.exit(1);
