import { randomBytes } from 'crypto';
import { WorldStateDb } from './index';

describe('world_state_db', () => {
  let worldStateDb: WorldStateDb;

  beforeEach(async () => {
    worldStateDb = new WorldStateDb('/tmp/world_state.db');
    worldStateDb.destroy();
    await worldStateDb.start();
  });

  afterEach(() => {
    worldStateDb.stop();
    worldStateDb.destroy();
  });

  it('should be initialized with correct metadata', async () => {
    // prettier-ignore
    const expectedDataRoot = Buffer.from([
      0x1d, 0xf6, 0xbd, 0xe5, 0x05, 0x16, 0xdd, 0x12, 0x01, 0x08, 0x8f, 0xd8, 0xdd, 0xa8, 0x4c, 0x97,
      0xed, 0xa5, 0x65, 0x24, 0x28, 0xd1, 0xc7, 0xe8, 0x6a, 0xf5, 0x29, 0xcc, 0x5e, 0x0e, 0xb8, 0x21,
    ]);

    // prettier-ignore
    const expectedNullifierRoot = Buffer.from([
      0x15, 0x21, 0x75, 0xcf, 0xfc, 0xb2, 0x3d, 0xfb, 0xd8, 0x02, 0x62, 0x80, 0x2e, 0x32, 0xef, 0xe7,
      0xdb, 0x5f, 0xdc, 0xb9, 0x1b, 0xa0, 0xa0, 0x52, 0x7a, 0xb1, 0xff, 0xb3, 0x23, 0xbf, 0x3f, 0xc0,
    ]);

    // prettier-ignore
    const expectedRootRoot = Buffer.from([
      0x1b, 0x22, 0xef, 0x60, 0x7a, 0xe0, 0x85, 0x88, 0xbc, 0x83, 0xa7, 0x9f, 0xfa, 0xce, 0xc5, 0x07,
      0x34, 0x7b, 0xd2, 0xde, 0xe4, 0x4c, 0x84, 0x61, 0x81, 0xb7, 0x05, 0x12, 0x85, 0xc3, 0x2c, 0x0a,
    ]);

    expect(worldStateDb.getRoot(0)).toEqual(expectedDataRoot);
    expect(worldStateDb.getRoot(1)).toEqual(expectedNullifierRoot);
    expect(worldStateDb.getRoot(2)).toEqual(expectedRootRoot);
    expect(worldStateDb.getSize(0)).toBe(BigInt(0));
    expect(worldStateDb.getSize(1)).toBe(BigInt(0));
    expect(worldStateDb.getSize(2)).toBe(BigInt(1));
  });

  it('should get correct value', async () => {
    const buffer = await worldStateDb.get(0, BigInt(0));
    expect(buffer).toEqual(Buffer.alloc(64, 0));
  });

  it('should get correct hash path', async () => {
    const path = (await worldStateDb.getHashPath(0, BigInt(0))).data;

    const expectedFirst = Buffer.from('1cdcf02431ba623767fe389337d011df1048dcc24b98ed81cec97627bab454a0', 'hex');
    const expectedLast = Buffer.from('10ae15eed66d2b5fa24239d72aa47d1bfd7f37eb0a1a55baf69e363c4808fc14', 'hex');

    expect(path.length).toEqual(32);
    expect(path[0][0]).toEqual(expectedFirst);
    expect(path[0][1]).toEqual(expectedFirst);
    expect(path[31][0]).toEqual(expectedLast);
    expect(path[31][1]).toEqual(expectedLast);

    const nullPath = (await worldStateDb.getHashPath(1, BigInt(0))).data;
    expect(nullPath.length).toEqual(128);
  });

  it('should update value', async () => {
    const value = Buffer.alloc(64, 5);
    const root = await worldStateDb.put(0, BigInt(0), value);

    const result = await worldStateDb.get(0, BigInt(0));
    expect(result).toEqual(value);

    // prettier-ignore
    expect(root).toEqual(Buffer.from([
      0x27, 0xdf, 0xb6, 0xc9, 0x95, 0x54, 0x24, 0xd3, 0x45, 0x7b, 0x19, 0x5d, 0x62, 0xc5, 0x3c, 0xdd,
      0x20, 0xe9, 0x27, 0xb5, 0x07, 0xa6, 0xbf, 0xc3, 0x47, 0x2c, 0xe5, 0xd8, 0xc3, 0x7c, 0x2c, 0x25
    ]));

    expect(worldStateDb.getRoot(0)).toEqual(root);
    expect(worldStateDb.getSize(0)).toEqual(BigInt(1));
  });

  it('should update multiple values', async () => {
    const num = 1024;
    const values = new Array(num).fill(0).map(_ => randomBytes(64));
    for (let i = 0; i < num; ++i) {
      await worldStateDb.put(0, BigInt(i), values[i]);
    }

    for (let i = 0; i < num; ++i) {
      const result = await worldStateDb.get(0, BigInt(i));
      expect(result).toEqual(values[i]);
    }

    expect(worldStateDb.getSize(0)).toEqual(BigInt(num));
  }, 60000);

  it('should update same value in both trees', async () => {
    const value1 = Buffer.alloc(64, 5);
    const value2 = Buffer.alloc(64, 6);
    await worldStateDb.put(0, BigInt(10), value1);
    await worldStateDb.put(1, BigInt(10), value2);

    const result1 = await worldStateDb.get(0, BigInt(10));
    const result2 = await worldStateDb.get(1, BigInt(10));

    expect(result1).toEqual(value1);
    expect(result2).toEqual(value2);
  });

  it('should be able to rollback to the previous commit', async () => {
    const values = new Array(3).fill(0).map(_ => randomBytes(64));

    const rootEmpty = worldStateDb.getRoot(0);
    await worldStateDb.put(0, BigInt(0), values[0]);
    expect(worldStateDb.getRoot(0)).not.toEqual(rootEmpty);

    await worldStateDb.rollback();
    expect(worldStateDb.getRoot(0)).toEqual(rootEmpty);

    await worldStateDb.put(0, BigInt(0), values[0]);
    await worldStateDb.put(0, BigInt(1), values[1]);
    await worldStateDb.commit();
    const root2 = worldStateDb.getRoot(0);
    await worldStateDb.put(0, BigInt(2), values[2]);
    expect(worldStateDb.getRoot(0)).not.toEqual(root2);

    await worldStateDb.rollback();
    expect(worldStateDb.getRoot(0)).toEqual(root2);
  });

  it('should read and write standard I/O sequentially', async () => {
    const num = 10;
    const values = new Array(num).fill(0).map(_ => randomBytes(64));
    await Promise.all(
      values.map(async (value, i) => {
        await worldStateDb.put(0, BigInt(i), value);
      }),
    );

    const buffers = await Promise.all(values.map(async (_, i) => worldStateDb.get(0, BigInt(i))));
    for (let i = 0; i < num; ++i) {
      expect(buffers[i]).toEqual(values[i]);
    }

    const hashPaths = await Promise.all(values.map((_, i) => worldStateDb.getHashPath(0, BigInt(i))));
    for (let i = 0; i < num; ++i) {
      const hashPath = await worldStateDb.getHashPath(0, BigInt(i));
      expect(hashPaths[i]).toEqual(hashPath);
    }
  });
});