// Diagnosa: kenapa filter operator menghasilkan 0 produk
import "dotenv/config";
import { getServices, getCountries, getOperators, getProducts } from "../src/providers/smscode/catalog.js";

const services = await getServices();
const svc = services.find((s) => s.name.toUpperCase().includes("WHATSAPP")) ?? services[0];
const countries = await getCountries();
const ctr = countries.find((c) => c.name.toUpperCase().includes("INDONES")) ?? countries[0];

console.log("service:", svc.id, svc.name, "platform_id:", (svc as any).platform_id);
console.log("country:", ctr.id, ctr.name);

const ops = await getOperators(Number(ctr.id), svc.id);
console.log("operators (dipakai tombol):", ops.map((o) => ({ id: o.operator_id, name: o.local_name ?? o.name })));

const products = await getProducts(svc.id);
const inCountry = products.filter((p) => Number(p.country_id) === Number(ctr.id));
const withOpr = inCountry.filter((p) => p.operator_id != null);
const distinct = [...new Set(withOpr.map((p) => `${typeof p.operator_id}:${p.operator_id}`))];
console.log("total produk platform:", products.length);
console.log("produk Indonesia:", inCountry.length);
console.log("produk Indonesia dgn operator:", withOpr.length);
console.log("operator_id unik di produk:", distinct.slice(0, 30));

// Simulasi filter seperti bot (strict ===)
const listId = ops.filter((o) => o.operator_id !== null).map((o) => Number(o.operator_id));
for (const id of listId.slice(0, 5)) {
  const hitStrict = inCountry.filter((p) => p.operator_id === id).length;
  const hitNum = inCountry.filter((p) => Number(p.operator_id) === id).length;
  console.log(`operator ${id}: strict===${hitStrict} | Number()==${hitNum}`);
}
