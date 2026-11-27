import { TemplatesService, IMPORT_TOTAL_MAX } from './templates.service';
import { TemplateKind } from './models/template.model';
import { CreateTemplateDto } from './dto/create-template.dto';

/** An in-memory stand-in for the two Sequelize models: just enough of findOne/findAll/count/create/upsert. */
function makeService(existing: Array<{ clientId: string; kind?: TemplateKind }> = []) {
  const rows = existing.map((r, i) => ({ templateId: `t${i}`, userId: 'u1', kind: TemplateKind.RECORDING, ...r }));
  const wrap = (row: Record<string, unknown>) => ({
    ...row,
    update: async (patch: Record<string, unknown>) => wrap(Object.assign(row, patch)),
    toJSON: () => ({ ...row }),
  });
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  const templateModel = {
    findOne: async ({ where }: { where: Record<string, unknown> }) => {
      const row = rows.find((r) => matches(r, where));
      return row ? wrap(row) : null;
    },
    findAll: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).map(wrap),
    count: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).length,
    create: async (values: Record<string, unknown>) => {
      const row = { templateId: `t${rows.length}`, kind: TemplateKind.RECORDING, ...values };
      rows.push(row as (typeof rows)[number]);
      return wrap(row);
    },
  };
  const templateDataModel = { upsert: async () => undefined };
  const service = new TemplatesService(templateModel as never, templateDataModel as never);
  return { service, rows };
}

const dto = (clientId: string, kind?: TemplateKind): CreateTemplateDto => ({
  clientId,
  name: clientId,
  domain: 'supplier.meesho.com',
  actions: [],
  metadata: {},
  ...(kind ? { kind } : {}),
});

describe('TemplatesService', () => {
  it('lists only step recordings unless asked for another kind (older extension builds read every row as a recording)', async () => {
    const { service } = makeService([{ clientId: 'rec' }, { clientId: 'smart', kind: TemplateKind.SMART }]);
    expect((await service.findAll('u1')).map((t) => t.clientId)).toEqual(['rec']);
    expect((await service.findAll('u1', TemplateKind.SMART)).map((t) => t.clientId)).toEqual(['smart']);
    expect((await service.findAll('u1', 'all')).map((t) => t.clientId).sort()).toEqual(['rec', 'smart']);
  });

  it('counts both kinds', async () => {
    const { service } = makeService([{ clientId: 'a' }, { clientId: 'b', kind: TemplateKind.SMART }]);
    expect(await service.count('u1')).toBe(2);
  });

  it('imports new templates and updates ones already stored', async () => {
    const { service, rows } = makeService([{ clientId: 'old' }]);
    const result = await service.importMany('u1', [dto('old'), dto('new', TemplateKind.SMART)], null);
    expect(result).toEqual({ saved: ['old', 'new'], skipped: [] });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.clientId === 'new')?.kind).toBe(TemplateKind.SMART);
  });

  it(`stops adding at ${IMPORT_TOTAL_MAX} templates but still updates existing ones`, async () => {
    const existing = Array.from({ length: IMPORT_TOTAL_MAX }, (_, i) => ({ clientId: `c${i}` }));
    const { service } = makeService(existing);
    const result = await service.importMany('u1', [dto('c0'), dto('extra')], null);
    expect(result).toEqual({ saved: ['c0'], skipped: ['extra'] });
  });
});
