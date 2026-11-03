import type { DataSource, Repository } from "typeorm";
import type { AiService } from "../../ai/ai.service";
import type { GeoService } from "../../geo/geo.service";
import type { NotificationsService } from "../../notifications/notifications.service";
import type { SettingsService } from "../../settings/settings.service";
import type { Building } from "../building.entity";
import { BuildingVerificationService } from "./building-verification.service";

const building = {
  id: "0b0f3d7e-6f0c-4d4b-9a51-1c2d3e4f5a60",
  submissionId: "1c1a4e8f-7a1d-4e5c-8b62-2d3e4f5a6b71",
  status: "pendente_validacao",
  name: "Edifício Jardim das Acácias",
  type: "edificio",
  cep: "01001000",
  street: "Rua das Flores",
  number: "100",
  district: "Centro",
  city: "São Paulo",
  state: "SP",
  unitsEstimate: null,
  facadePhotoUrl: null,
  createdBy: "2d2b5f9a-8b2e-4f6d-9c73-3e4f5a6b7c82",
  location: { type: "Point", coordinates: [-46.63, -23.55] },
} as unknown as Building;

/**
 * Aplicação do resultado automático (P00-B5.2): a transição condicional decide entre aplicar e
 * descartar. Bordas simuladas (banco, mapa, IA, notificação); o SQL real é coberto pelos e2e.
 */
function setup(affected: number) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const save = jest.fn();
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return sql.startsWith("UPDATE buildings SET status") ? [[], affected] : [[], 0];
    }),
    getRepository: () => ({ save }),
  };
  const dataSource = {
    transaction: jest.fn((work: (m: typeof manager) => unknown) => work(manager)),
    query: jest
      .fn()
      .mockResolvedValue([{ status: "verificado", submission_id: building.submissionId }]),
  };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const service = new BuildingVerificationService(
    { findOneBy: jest.fn().mockResolvedValue(building) } as unknown as Repository<Building>,
    dataSource as unknown as DataSource,
    {
      reverse: jest.fn().mockResolvedValue(null),
      nearbyPlaces: jest.fn().mockResolvedValue([]),
    } as unknown as GeoService,
    {
      structured: jest.fn().mockResolvedValue({
        data: {
          score: 0.9,
          decisao_sugerida: "verificado",
          endereco_consistente: true,
          tipo_identificado: "edificio",
          nome_confere: "sim",
          evidencias: [],
          sinais_de_risco: [],
          nome_sugerido: null,
          motivo_para_usuario: null,
        },
        model: "fake/model",
      }),
    } as unknown as AiService,
    {
      get: jest.fn(async (key: string) => (key === "buildings.verifyThreshold" ? 0.8 : 0.5)),
    } as unknown as SettingsService,
    notifications as unknown as NotificationsService,
  );
  return { service, queries, save, notifications };
}

describe("BuildingVerificationService.verify — resultado atrasado", () => {
  it("aplica só na submissão capturada e ainda pendente; registra a submissão e notifica", async () => {
    const t = setup(1);
    expect(await t.service.verify(building.id)).toMatchObject({ decision: "verificado" });
    const [transition] = t.queries;
    expect(transition?.sql).toContain("status = 'pendente_validacao' AND submission_id = $2");
    expect(transition?.params.slice(0, 2)).toEqual([building.id, building.submissionId]);
    expect(t.save).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: building.submissionId, decision: "verificado" }),
    );
    expect(t.notifications.notify).toHaveBeenCalledTimes(1);
  });

  it("descarta sem registro, sem efeito e sem notificação; devolve null", async () => {
    const t = setup(0);
    expect(await t.service.verify(building.id)).toBeNull();
    expect(t.queries).toHaveLength(1);
    expect(t.save).not.toHaveBeenCalled();
    expect(t.notifications.notify).not.toHaveBeenCalled();
  });
});
