#!/bin/bash

# Docker权限修复脚本
echo "=== Docker权限修复脚本 ==="

# 检查是否在Docker容器中
if [ -f /.dockerenv ]; then
    echo "✅ 检测到Docker容器环境"
else
    echo "⚠️  未检测到Docker容器环境，但继续执行"
fi

# 检查当前用户
echo "当前用户: $(whoami)"
echo "用户ID: $(id -u)"
echo "组ID: $(id -g)"

# 检查data目录
DATA_DIR="./data"
echo "检查数据目录: $DATA_DIR"

if [ ! -d "$DATA_DIR" ]; then
    echo "创建数据目录..."
    mkdir -p "$DATA_DIR"
    if [ $? -eq 0 ]; then
        echo "✅ 数据目录创建成功"
    else
        echo "❌ 数据目录创建失败"
        exit 1
    fi
else
    echo "✅ 数据目录已存在"
fi

# 检查data目录权限
if [ -r "$DATA_DIR" ] && [ -w "$DATA_DIR" ]; then
    echo "✅ 数据目录有读写权限"
else
    echo "❌ 数据目录权限不足"
    echo "尝试修复权限..."
    chmod 755 "$DATA_DIR"
    if [ $? -eq 0 ]; then
        echo "✅ 数据目录权限修复成功"
    else
        echo "❌ 数据目录权限修复失败"
    fi
fi

# 检查users.json文件
USERS_FILE="$DATA_DIR/users.json"
echo "检查用户文件: $USERS_FILE"

if [ ! -f "$USERS_FILE" ]; then
    echo "用户文件不存在，创建默认文件..."
    cat > "$USERS_FILE" << 'EOF'
[
  {
    "id": "1",
    "username": "admin",
    "email": "admin@example.com",
    "password": "happyclo1145",
    "role": "admin",
    "dailyUsage": 0,
    "lastUsageDate": "2025-06-15T16:37:43.590Z",
    "createdAt": "2025-06-15T16:37:43.590Z",
    "passkeyEnabled": false,
    "passkeyCredentials": []
  }
]
EOF
    if [ $? -eq 0 ]; then
        echo "✅ 默认用户文件创建成功"
    else
        echo "❌ 默认用户文件创建失败"
        exit 1
    fi
else
    echo "✅ 用户文件已存在"
fi

# 检查users.json文件权限
if [ -r "$USERS_FILE" ] && [ -w "$USERS_FILE" ]; then
    echo "✅ 用户文件有读写权限"
else
    echo "❌ 用户文件权限不足"
    echo "尝试修复权限..."
    chmod 644 "$USERS_FILE"
    if [ $? -eq 0 ]; then
        echo "✅ 用户文件权限修复成功"
    else
        echo "❌ 用户文件权限修复失败"
    fi
fi

# 检查文件内容
echo "检查用户文件内容..."
if [ -s "$USERS_FILE" ]; then
    echo "✅ 用户文件不为空"
    
    # 检查JSON格式
    if python3 -m json.tool "$USERS_FILE" > /dev/null 2>&1; then
        echo "✅ 用户文件JSON格式正确"
    else
        echo "❌ 用户文件JSON格式错误"
        echo "尝试修复JSON格式..."
        # 备份原文件
        cp "$USERS_FILE" "$USERS_FILE.backup"
        # 创建新的正确格式文件
        cat > "$USERS_FILE" << 'EOF'
[
  {
    "id": "1",
    "username": "admin",
    "email": "admin@example.com",
    "password": "happyclo1145",
    "role": "admin",
    "dailyUsage": 0,
    "lastUsageDate": "2025-06-15T16:37:43.590Z",
    "createdAt": "2025-06-15T16:37:43.590Z",
    "passkeyEnabled": false,
    "passkeyCredentials": []
  }
]
EOF
        echo "✅ 用户文件格式修复完成"
    fi
else
    echo "❌ 用户文件为空"
    echo "重新创建用户文件..."
    cat > "$USERS_FILE" << 'EOF'
[
  {
    "id": "1",
    "username": "admin",
    "email": "admin@example.com",
    "password": "happyclo1145",
    "role": "admin",
    "dailyUsage": 0,
    "lastUsageDate": "2025-06-15T16:37:43.590Z",
    "createdAt": "2025-06-15T16:37:43.590Z",
    "passkeyEnabled": false,
    "passkeyCredentials": []
  }
]
EOF
    echo "✅ 用户文件重新创建完成"
fi

# 显示文件信息
echo ""
echo "=== 文件信息 ==="
ls -la "$DATA_DIR"
echo ""
echo "用户文件内容预览:"
head -20 "$USERS_FILE"

echo ""
echo "=== 修复完成 ==="
echo "现在可以重新启动应用程序" 