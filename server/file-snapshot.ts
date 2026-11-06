import fs from "node:fs";

export const fileStamp = (stat: fs.Stats) =>
  [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.nlink,
    stat.size,
    stat.mtimeMs,
    stat.ctimeMs,
  ].join(":");

/** The caller must confine the path and bound the expected size before opening. */
export function readFileSnapshot(file: string, expected: fs.Stats) {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const signature = fileStamp(expected);
    if (
      !expected.isFile() ||
      expected.nlink !== 1 ||
      fileStamp(fs.fstatSync(fd)) !== signature ||
      fs.realpathSync.native(file) !== file
    )
      throw Error("Source path changed");
    const data = Buffer.alloc(expected.size + 1);
    let size = 0;
    while (size < data.length) {
      const count = fs.readSync(fd, data, size, data.length - size, null);
      if (!count) break;
      size += count;
    }
    if (
      size !== expected.size ||
      fileStamp(fs.fstatSync(fd)) !== signature ||
      fileStamp(fs.lstatSync(file)) !== signature
    )
      throw Error("Source changed while reading");
    return data.subarray(0, size);
  } finally {
    fs.closeSync(fd);
  }
}
