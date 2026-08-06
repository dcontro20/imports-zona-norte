// discoveryImport.test.js — la ingesta contra el contrato §6 (dedup en orden
// de fuerza) y §7 (supresión con memoria, identidad suficiente).
import { describe, it, expect } from "vitest";
import {
  normalizarTelefono, clavesDeRegistro, puedeSuprimirse,
  revisarDescubiertos, altaDesdeDescubierto, suprimirDescubierto,
  identidadesExistentes, hashDjb2, idDeterministico, altaAutomatica,
  ingestarDescubiertos, ingestarLote,
} from "./discoveryImport.js";

const desc = (over = {}) => ({
  businessName: "Kiosco Golden", zone: "Palermo", address: "El Salvador 4813, CABA",
  phone: "+54 11 4831-2200", contactName: "", source: "descubrimiento", notes: "",
  lat: -34.58, lng: -58.43, pipelineStage: "prospecto",
  via: "google_maps", descubiertoTermino: "kiosco", descubiertoEn: "Palermo, CABA, Argentina",
  descubiertoAt: "2026-07-30", placeId: "PID_GOLDEN", urlOrigen: "https://maps.google.com/?cid=9",
  clavesIdentidad: ["nd:kiosco-golden|el-salvador-4813-caba"],
  web: "", redSocial: "", categoria: "Kiosco", email: "", rating: 4.4,
  reviewsCount: 51, horariosCompletos: "si", ...over,
});

describe("normalizarTelefono — normalización AR pragmática", () => {
  it("saca todo lo no-dígito y los prefijos 54/549/0", () => {
    expect(normalizarTelefono("+54 11 4831-2200")).toBe("1148312200");
    expect(normalizarTelefono("+54 9 11 4831-2200")).toBe("1148312200");
    expect(normalizarTelefono("011 4831 2200")).toBe("1148312200");
  });
  it("el mismo teléfono escrito distinto da la MISMA clave", () => {
    const formas = ["+54 11 4831-2200", "011-4831-2200", "+549 11 48312200", "11 4831 2200"];
    const claves = new Set(formas.map(normalizarTelefono));
    expect(claves.size).toBe(1);
  });
  it("menos de 6 dígitos no identifica ⇒ vacío", () => {
    expect(normalizarTelefono("4831")).toBe("");
    expect(normalizarTelefono("")).toBe("");
    expect(normalizarTelefono(null)).toBe("");
  });
});

describe("clavesDeRegistro — superset del runner, para cualquier registro", () => {
  it("descubierto: nd + placeId + tel + clavesIdentidad", () => {
    const claves = clavesDeRegistro(desc());
    expect(claves.has("nd:kiosco-golden|el-salvador-4813-caba")).toBe(true);
    expect(claves.has("pid:PID_GOLDEN")).toBe(true);
    expect(claves.has("tel:1148312200")).toBe(true);
  });
  it("cliente retail (name/address/phone) genera claves comparables", () => {
    const claves = clavesDeRegistro({ name: "Kiosco Golden", address: "El Salvador 4813, CABA", phone: "011 4831 2200" });
    expect(claves.has("nd:kiosco-golden|el-salvador-4813-caba")).toBe(true);
    expect(claves.has("tel:1148312200")).toBe(true);
  });
  it("entrada de supresión (nombre/direccion/claves) re-expone sus claves", () => {
    const claves = clavesDeRegistro({ nombre: "Kiosco X", direccion: "Calle 1", claves: ["pid:ABC"] });
    expect(claves.has("nd:kiosco-x|calle-1")).toBe(true);
    expect(claves.has("pid:ABC")).toBe(true);
  });
});

describe("revisarDescubiertos — dedup + supresión", () => {
  it("lote limpio: todo importable", () => {
    const r = revisarDescubiertos({ prospectos: [desc()], prospects: [], clients: [], suprimidos: [] });
    expect(r.importables).toBe(1);
    expect(r.items[0].estado).toBe("importable");
  });
  it("duplicado contra prospecto vivo (por placeId) con motivo nominal", () => {
    const r = revisarDescubiertos({
      prospectos: [desc()],
      prospects: [{ businessName: "Kiosco Golden (viejo)", placeId: "PID_GOLDEN" }],
    });
    expect(r.duplicados).toBe(1);
    expect(r.items[0].motivo).toContain('prospecto "Kiosco Golden (viejo)"');
  });
  it("duplicado contra CLIENTE por teléfono (no prospectar a un cliente actual)", () => {
    const r = revisarDescubiertos({
      prospectos: [desc()],
      clients: [{ name: "Golden SRL", phone: "011-4831-2200" }],
    });
    expect(r.duplicados).toBe(1);
    expect(r.items[0].motivo).toContain('cliente "Golden SRL"');
  });
  it("prospecto BORRADO (Papelera) no bloquea; suprimido SÍ", () => {
    const borrado = { businessName: "Kiosco Golden", address: "El Salvador 4813, CABA", isDeleted: true };
    const r1 = revisarDescubiertos({ prospectos: [desc()], prospects: [borrado] });
    expect(r1.importables).toBe(1);
    const r2 = revisarDescubiertos({
      prospectos: [desc()],
      suprimidos: [{ nombre: "Kiosco Golden", direccion: "El Salvador 4813, CABA" }],
    });
    expect(r2.suprimidos).toBe(1);
    expect(r2.items[0].estado).toBe("suprimido");
  });
  it("la supresión gana sobre el duplicado (mismo orden que el runner)", () => {
    const r = revisarDescubiertos({
      prospectos: [desc()],
      prospects: [{ businessName: "Kiosco Golden", placeId: "PID_GOLDEN" }],
      suprimidos: [{ nombre: "Kiosco Golden", direccion: "El Salvador 4813, CABA" }],
    });
    expect(r.items[0].estado).toBe("suprimido");
  });
  it("dedup DENTRO del lote: dos avistajes del mismo negocio ⇒ 1 alta", () => {
    const r = revisarDescubiertos({ prospectos: [desc(), desc({ placeId: "OTRO_PID" })] });
    expect(r.importables).toBe(1);
    expect(r.duplicados).toBe(1);
    expect(r.items[1].motivo).toContain("descubierto");
  });
  it("sin colisiones de claves no hay falsos positivos", () => {
    const r = revisarDescubiertos({
      prospectos: [desc()],
      prospects: [{ businessName: "Otro Kiosco", address: "Av. Santa Fe 1", phone: "011 5555 0001", placeId: "ZZZ" }],
      clients: [{ name: "Cliente Ajeno", phone: "011 5555 0002" }],
    });
    expect(r.importables).toBe(1);
  });
});

describe("identidadesExistentes — el estado que el worker inyecta al runner", () => {
  it("junta prospectos + clientes vivos + staging pendiente; ignora borrados", () => {
    const claves = identidadesExistentes({
      prospects: [
        { businessName: "Kiosco A", address: "Calle 1" },
        { businessName: "Kiosco Borrado", address: "Calle 2", isDeleted: true },
      ],
      clients: [{ name: "Cliente B", phone: "011 4444 5555" }],
      staging: [{ prospectos: [{ businessName: "Staged C", address: "Calle 3", placeId: "PID_C" }] }],
    });
    expect(claves.has("nd:kiosco-a|calle-1")).toBe(true);
    expect(claves.has("nd:kiosco-borrado|calle-2")).toBe(false);
    expect(claves.has("tel:1144445555")).toBe(true);
    expect(claves.has("pid:PID_C")).toBe(true);
  });
  it("vacío da set vacío (primera corrida del sistema)", () => {
    expect(identidadesExistentes({}).size).toBe(0);
    expect(identidadesExistentes().size).toBe(0);
  });
});

describe("altaDesdeDescubierto / suprimirDescubierto", () => {
  it("el alta inyecta id y fechas del llamador, sin tocar el resto", () => {
    const p = altaDesdeDescubierto(desc(), { id: "id-1", at: "2026-07-30T12:00:00Z" });
    expect(p.id).toBe("id-1");
    expect(p.foundAt).toBe("2026-07-30T12:00:00Z");
    expect(p.lastContactAt).toBe("2026-07-30T12:00:00Z");
    expect(p.businessName).toBe("Kiosco Golden");
    expect(p.source).toBe("descubrimiento");
  });
  it("la supresión guarda identidad completa + claves ordenadas + firma", () => {
    const s = suprimirDescubierto(desc(), { id: "s-1", at: "2026-07-30", por: "Diego" });
    expect(s.nombre).toBe("Kiosco Golden");
    expect(s.direccion).toBe("El Salvador 4813, CABA");
    expect(s.claves).toEqual([...s.claves].sort());
    expect(s.claves).toContain("pid:PID_GOLDEN");
    expect(s.motivo).toBe("descartado en revisión");
    expect(s.por).toBe("Diego");
  });
  it("regla heredada P5: sin identidad suficiente NO se suprime", () => {
    const sinIdentidad = desc({ businessName: "X", address: "", web: "" });
    expect(puedeSuprimirse(sinIdentidad)).toBe(false);
    expect(() => suprimirDescubierto(sinIdentidad, { at: "2026-07-30" })).toThrow(/insuficiente/);
    expect(puedeSuprimirse(desc())).toBe(true);
  });
});

// --- F2 del ciclo v2: auto-ingesta (spec §5) ---

describe("idDeterministico — el mismo descubrimiento da SIEMPRE el mismo id", () => {
  it("con placeId: dsc_<placeId>", () => {
    expect(idDeterministico(desc())).toBe("dsc_PID_GOLDEN");
  });
  it("sin placeId cae a la clave nd hasheada, estable entre corridas", () => {
    const sinPid = desc({ placeId: "" });
    const id = idDeterministico(sinPid);
    expect(id).toBe("dsc_nd_" + hashDjb2("nd:kiosco-golden|el-salvador-4813-caba"));
    expect(idDeterministico(desc({ placeId: "" }))).toBe(id);
  });
  it("el nd ignora la forma del texto: mismo negocio escrito distinto = mismo id", () => {
    const a = desc({ placeId: "", businessName: "Kiosco Goldén", address: "El Salvador 4813, CABA" });
    const b = desc({ placeId: "", businessName: "KIOSCO  GOLDEN", address: "el salvador 4813 caba" });
    expect(idDeterministico(a)).toBe(idDeterministico(b));
  });
  it("negocios distintos NO colisionan", () => {
    const otro = desc({ placeId: "", businessName: "Kiosco Plata", address: "Otra 100, CABA" });
    expect(idDeterministico(otro)).not.toBe(idDeterministico(desc({ placeId: "" })));
  });
  it("sin placeId y sin nombre+dirección no hay identidad derivable ⇒ vacío", () => {
    expect(idDeterministico(desc({ placeId: "", address: "" }))).toBe("");
    expect(idDeterministico({})).toBe("");
  });
});

describe("altaAutomatica — el descubierto que entra SOLO", () => {
  it("sella ingresoAutomatico y NO inventa análisis humano", () => {
    const p = altaAutomatica(desc(), { id: "dsc_PID_GOLDEN", at: "2026-08-06T12:00:00Z" });
    expect(p.id).toBe("dsc_PID_GOLDEN");
    expect(p.ingresoAutomatico).toBe(true);
    expect(p.analizadoAt).toBeUndefined();
    expect(p.foundAt).toBe("2026-08-06T12:00:00Z");
    expect(p.source).toBe("descubrimiento");
  });
});

describe("ingestarDescubiertos — el reemplazo del modal de revisión (§5)", () => {
  const resultado = (prospectos) => ({ id: "job-1", zona: "Palermo", termino: "kiosco", prospectos });
  const AT = "2026-08-06T12:00:00Z";
  const ingerir = (over = {}) => ingestarDescubiertos({ at: AT, nuevoId: () => "uid-1", ...over });

  it("todo lo importable entra solo, con id determinístico", () => {
    const r = ingerir({ resultado: resultado([desc(), desc({ businessName: "Kiosco Plata", address: "Otra 100", placeId: "PID_PLATA", phone: "", clavesIdentidad: [] })]) });
    expect(r.altas.map(p => p.id)).toEqual(["dsc_PID_GOLDEN", "dsc_PID_PLATA"]);
    expect(r.altas.every(p => p.ingresoAutomatico)).toBe(true);
  });

  it("el dedup NO se perdió: lo que ya existe vivo no entra", () => {
    const vivo = { id: "p-1", businessName: "Kiosco Golden", address: "El Salvador 4813, CABA", phone: "" };
    const r = ingerir({ resultado: resultado([desc()]), prospects: [vivo] });
    expect(r.altas).toEqual([]);
    expect(r.duplicados).toBe(1);
  });

  it("lo descartado con memoria sigue sin volver", () => {
    const supr = suprimirDescubierto(desc(), { id: "s-1", at: "2026-07-30", por: "Diego" });
    const r = ingerir({ resultado: resultado([desc()]), suprimidos: [supr] });
    expect(r.altas).toEqual([]);
    expect(r.suprimidos).toBe(1);
  });

  it("idempotencia: ingerir dos veces produce el MISMO id (el merge lo absorbe)", () => {
    const uno = ingerir({ resultado: resultado([desc()]) });
    const dos = ingerir({ resultado: resultado([desc()]) });
    expect(uno.altas[0].id).toBe(dos.altas[0].id);
  });

  it("el prospecto ya ingerido bloquea su propia re-ingesta (dedup por identidad)", () => {
    const primera = ingerir({ resultado: resultado([desc()]) });
    const segunda = ingerir({ resultado: resultado([desc()]), prospects: primera.altas });
    expect(segunda.altas).toEqual([]);
    expect(segunda.duplicados).toBe(1);
  });

  it("sin identidad derivable usa el id inyectado por la app (uid)", () => {
    const anonimo = desc({ placeId: "", address: "", clavesIdentidad: [], web: "" });
    const r = ingerir({ resultado: resultado([anonimo]) });
    expect(r.altas[0].id).toBe("uid-1");
  });
});

describe("ingestarLote — varias búsquedas que llegan juntas", () => {
  const resultado = (id, prospectos) => ({ id, zona: "Palermo", termino: "kiosco", prospectos });
  const plata = desc({ businessName: "Kiosco Plata", address: "Otra 100", placeId: "PID_PLATA", phone: "", clavesIdentidad: [] });

  it("acumula: el mismo negocio en dos búsquedas entra UNA sola vez", () => {
    const { altas, resumenes } = ingestarLote({
      resultados: [resultado("job-1", [desc()]), resultado("job-2", [desc(), plata])],
      at: "2026-08-06T12:00:00Z", nuevoId: () => "uid-x",
    });
    expect(altas.map(p => p.id)).toEqual(["dsc_PID_GOLDEN", "dsc_PID_PLATA"]);
    expect(resumenes[1].duplicados).toBe(1);
  });

  it("un resumen por búsqueda, con su resultado para el audit y el consumo del staging", () => {
    const { resumenes } = ingestarLote({
      resultados: [resultado("job-1", [desc()]), resultado("job-2", [plata])],
      at: "2026-08-06T12:00:00Z",
    });
    expect(resumenes.map(r => r.resultado.id)).toEqual(["job-1", "job-2"]);
    expect(resumenes.every(r => r.altas.length === 1)).toBe(true);
  });

  it("sin resultados no hace nada", () => {
    expect(ingestarLote({}).altas).toEqual([]);
  });
});
