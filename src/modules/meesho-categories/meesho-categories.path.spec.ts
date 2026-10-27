import { MeeshoCategoriesService } from './meesho-categories.service';

type Node = { name: string; level: number; parentId: string | null };
type Row = Node & { meeshoCategoryId: string };

/** A tiny category tree behind the two model calls pathFor makes. */
function serviceWith(
  nodesById: Record<string, Node>,
  byExternalId: Record<number, Row[]>,
) {
  const model = {
    findAll: jest.fn(({ where }: { where: { externalId: number } }) =>
      Promise.resolve(byExternalId[where.externalId] ?? []),
    ),
    findByPk: jest.fn((id: string) => Promise.resolve(nodesById[id] ?? null)),
  };
  return { service: new MeeshoCategoriesService(model as never), model };
}

const tree: Record<string, Node> = {
  sup: { name: 'Electronics', level: 1, parentId: null },
  cat: { name: 'Mobile Accessories', level: 2, parentId: 'sup' },
  sub: { name: 'Chargers', level: 3, parentId: 'cat' },
  leaf: { name: 'Power Banks', level: 4, parentId: 'sub' },
};
const full = ['Electronics', 'Mobile Accessories', 'Chargers', 'Power Banks'];

describe('MeeshoCategoriesService.pathFor', () => {
  it('walks from the matched node up to the top and returns the names top first', async () => {
    const { service } = serviceWith(tree, {
      5012: [{ ...tree.leaf, meeshoCategoryId: 'leaf' }],
    });
    await expect(service.pathFor(5012, 'Power Banks')).resolves.toEqual(full);
  });

  it('when an id is reused across levels, prefers the node named like the product, then the deepest', async () => {
    const other: Row = {
      name: 'Kurtis',
      level: 2,
      parentId: 'sup',
      meeshoCategoryId: 'other',
    };
    const { service } = serviceWith(tree, {
      5012: [other, { ...tree.leaf, meeshoCategoryId: 'leaf' }],
    });
    await expect(service.pathFor(5012, 'power  banks')).resolves.toEqual(full);
    await expect(service.pathFor(5012, undefined)).resolves.toEqual(full);
  });

  it('returns nothing for an unknown id', async () => {
    const { service } = serviceWith(tree, {});
    await expect(service.pathFor(1)).resolves.toBeUndefined();
  });
});
