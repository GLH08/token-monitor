#!/bin/sh
set -e

echo "[Init] Checking database connection string..."

# 动态探测环境变量中的 DATABASE_URL，修改 prisma provider
if echo "$DATABASE_URL" | grep -q "^postgres"; then
    echo "[Init] Detected PostgreSQL connection string. Adapting Prisma schema..."
    sed -i 's/provider *= *"mysql"/provider = "postgresql"/' prisma/schema.prisma
elif echo "$DATABASE_URL" | grep -q "^mysql"; then
    echo "[Init] Detected MySQL connection string. Adapting Prisma schema..."
    sed -i 's/provider *= *"postgresql"/provider = "mysql"/' prisma/schema.prisma
else
    echo "[Init] Warning: Unrecognized DATABASE_URL format. Prisma schema remains unchanged."
fi

echo "[Init] Generating Prisma Client for the target database..."
# 这里每次容器启动都会根据刚刚的改动生成对应的 client
npx prisma generate

echo "[Init] Starting Node.js server..."
exec node index.js
