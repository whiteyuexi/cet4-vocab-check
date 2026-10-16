# 解压 Tatoeba 的 .tsv.bz2（纯文本压缩，不是 tar 包，所以 tar 命令解不开）
# 用法: py scripts/bz2-extract.py <输入.bz2> <输出>
import bz2, shutil, sys, os

def main():
    if len(sys.argv) < 3:
        print('用法: py bz2-extract.py <in.bz2> <out>')
        return 1
    src, dst = sys.argv[1], sys.argv[2]
    if not os.path.exists(src):
        print('找不到输入文件: ' + src)
        return 1
    with bz2.open(src, 'rb') as fi, open(dst, 'wb') as fo:
        shutil.copyfileobj(fi, fo)
    print('解压完成: ' + dst + '  ' + str(round(os.path.getsize(dst) / 1048576, 1)) + ' MB')
    return 0

sys.exit(main())
