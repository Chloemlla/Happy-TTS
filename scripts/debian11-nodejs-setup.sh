#!/bin/bash

# Debian 11 Node.js 自动化配置脚本
# 功能：安装Node.js、配置root登录、生成SSH密钥、禁用密码登录、上传日志

set -e  # 遇到错误立即退出

# 日志文件路径
LOG_FILE="/tmp/debian11-setup-$(date +%Y%m%d_%H%M%S).log"
LOG_UPLOAD_URL="https://logpaste.com"

# 错误处理函数
error_handler() {
    local exit_code=$?
    log_error "脚本执行出错，退出码: $exit_code"
    log_error "错误位置: ${BASH_SOURCE[1]}:${BASH_LINENO[0]}"
    
    # 尝试上传错误日志
    if [[ -f "$LOG_FILE" ]]; then
        log_info "尝试上传错误日志..."
        upload_log
    fi
    
    exit $exit_code
}

# 设置错误处理
trap error_handler ERR

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# 记录纯文本日志（不包含颜色代码）
log_text() {
    echo "$1" >> "$LOG_FILE"
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本需要root权限运行"
        exit 1
    fi
}

# 更新系统
update_system() {
    log_info "更新系统包列表..."
    apt update -y
    log_info "升级系统包..."
    apt upgrade -y
    log_success "系统更新完成"
}

# 安装Node.js
install_nodejs() {
    log_info "检查Node.js安装状态..."
    
    # 检查Node.js是否已安装
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log_info "Node.js已安装: $NODE_VERSION"
    else
        log_info "开始安装最新版本Node.js..."
        
        # 安装curl（如果没有的话）
        apt install -y curl
        
        # 添加NodeSource仓库（使用最新LTS版本）
        log_info "添加NodeSource仓库（最新LTS版本）..."
        curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
        
        # 安装Node.js
        log_info "安装Node.js..."
        apt install -y nodejs
        
        NODE_VERSION=$(node --version)
        log_success "Node.js安装完成: $NODE_VERSION"
    fi
    
    # 检查npm是否已安装
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        log_info "npm已安装: $NPM_VERSION"
        
        # 检查是否需要升级npm
        log_info "检查npm版本..."
        npm install -g npm@latest
    else
        log_error "npm未安装，请检查Node.js安装"
        return 1
    fi
    
    # 检查并安装常用全局包
    log_info "检查常用全局包..."
    
    # 检查yarn
    if command -v yarn &> /dev/null; then
        YARN_VERSION=$(yarn --version)
        log_info "yarn已安装: $YARN_VERSION"
    else
        log_info "安装yarn..."
        npm install -g yarn
    fi
    
    # 检查pm2
    if command -v pm2 &> /dev/null; then
        log_info "pm2已安装"
    else
        log_info "安装pm2..."
        npm install -g pm2
    fi
    
    # 检查nodemon
    if command -v nodemon &> /dev/null; then
        log_info "nodemon已安装"
    else
        log_info "安装nodemon..."
        npm install -g nodemon
    fi
    
    # 检查typescript
    if command -v tsc &> /dev/null; then
        log_info "typescript已安装"
    else
        log_info "安装typescript..."
        npm install -g typescript
    fi
    
    # 检查ts-node
    if command -v ts-node &> /dev/null; then
        log_info "ts-node已安装"
    else
        log_info "安装ts-node..."
        npm install -g ts-node
    fi
    
    # 显示最终版本信息
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    YARN_VERSION=$(yarn --version 2>/dev/null || echo "未安装")
    log_success "Node.js环境检查完成:"
    log_success "  Node.js: $NODE_VERSION"
    log_success "  npm: $NPM_VERSION"
    log_success "  yarn: $YARN_VERSION"
}

# 配置SSH服务
configure_ssh() {
    log_info "配置SSH服务..."
    
    # 备份原始SSH配置
    cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S)
    
    SSH_KEY_DIR="/root/.ssh"
    mkdir -p $SSH_KEY_DIR
    chmod 700 $SSH_KEY_DIR
    
    # 检查是否已存在SSH密钥
    if [[ -f "$SSH_KEY_DIR/id_rsa" && -f "$SSH_KEY_DIR/id_ed25519" ]]; then
        log_info "检测到已存在的SSH密钥，跳过密钥生成..."
        log_info "RSA密钥: $SSH_KEY_DIR/id_rsa"
        log_info "ED25519密钥: $SSH_KEY_DIR/id_ed25519"
        
        # 检查authorized_keys文件
        if [[ ! -f "$SSH_KEY_DIR/authorized_keys" ]]; then
            log_info "创建authorized_keys文件..."
            cat $SSH_KEY_DIR/id_rsa.pub > $SSH_KEY_DIR/authorized_keys
            cat $SSH_KEY_DIR/id_ed25519.pub >> $SSH_KEY_DIR/authorized_keys
            chmod 600 $SSH_KEY_DIR/authorized_keys
        fi
        
        # 显示现有密钥信息
        log_warning "=== 现有RSA公钥 ==="
        cat $SSH_KEY_DIR/id_rsa.pub | tee -a "$LOG_FILE"
        log_warning "=== RSA公钥结束 ==="
        
        log_warning "=== 现有ED25519公钥 ==="
        cat $SSH_KEY_DIR/id_ed25519.pub | tee -a "$LOG_FILE"
        log_warning "=== ED25519公钥结束 ==="
        
        log_success "使用现有SSH密钥配置"
    else
        # 生成SSH密钥对
        log_info "生成新的SSH密钥对..."
        
        # 生成RSA密钥对
        ssh-keygen -t rsa -b 4096 -f $SSH_KEY_DIR/id_rsa -N "" -C "root@$(hostname)"
        
        # 生成ED25519密钥对（更安全）
        ssh-keygen -t ed25519 -f $SSH_KEY_DIR/id_ed25519 -N "" -C "root@$(hostname)"
        
        # 设置权限
        chmod 600 $SSH_KEY_DIR/id_rsa
        chmod 644 $SSH_KEY_DIR/id_rsa.pub
        chmod 600 $SSH_KEY_DIR/id_ed25519
        chmod 644 $SSH_KEY_DIR/id_ed25519.pub
        
        # 创建authorized_keys文件
        cat $SSH_KEY_DIR/id_rsa.pub > $SSH_KEY_DIR/authorized_keys
        cat $SSH_KEY_DIR/id_ed25519.pub >> $SSH_KEY_DIR/authorized_keys
        chmod 600 $SSH_KEY_DIR/authorized_keys
        
        log_success "SSH密钥生成完成"
        
        # 打印私钥到日志（用于备份）
        log_warning "=== RSA私钥内容（请妥善保存）==="
        cat $SSH_KEY_DIR/id_rsa | tee -a "$LOG_FILE"
        log_warning "=== RSA私钥结束 ==="
        
        log_warning "=== ED25519私钥内容（请妥善保存）==="
        cat $SSH_KEY_DIR/id_ed25519 | tee -a "$LOG_FILE"
        log_warning "=== ED25519私钥结束 ==="
        
        log_warning "=== 公钥内容（可添加到其他机器的authorized_keys）==="
        cat $SSH_KEY_DIR/authorized_keys | tee -a "$LOG_FILE"
        log_warning "=== 公钥结束 ==="
    fi
}

# 配置SSH服务允许root登录
configure_sshd() {
    log_info "检查SSH服务配置..."
    
    # 检查是否已经配置过
    if grep -q "PermitRootLogin yes" /etc/ssh/sshd_config && \
       grep -q "PasswordAuthentication no" /etc/ssh/sshd_config && \
       grep -q "PubkeyAuthentication yes" /etc/ssh/sshd_config; then
        log_info "检测到SSH已正确配置，跳过SSH配置..."
        log_info "当前SSH配置："
        grep -E "(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication)" /etc/ssh/sshd_config
        log_success "SSH配置已存在，无需重新配置"
    else
        log_info "配置SSH服务允许root登录..."
        
        # 备份原始SSH配置
        cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S)
        
        # 修改SSH配置
        sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
        sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
        sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config
        
        # 确保以下配置存在（避免重复添加）
        if ! grep -q "PermitRootLogin yes" /etc/ssh/sshd_config; then
            echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
        fi
        if ! grep -q "PasswordAuthentication no" /etc/ssh/sshd_config; then
            echo "PasswordAuthentication no" >> /etc/ssh/sshd_config
        fi
        if ! grep -q "PubkeyAuthentication yes" /etc/ssh/sshd_config; then
            echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config
        fi
        if ! grep -q "AuthorizedKeysFile .ssh/authorized_keys" /etc/ssh/sshd_config; then
            echo "AuthorizedKeysFile .ssh/authorized_keys" >> /etc/ssh/sshd_config
        fi
        
        # 重启SSH服务
        systemctl restart ssh
        systemctl enable ssh
        
        log_success "SSH配置完成，已启用root登录和密钥认证，禁用密码登录"
    fi
}

# 重置主机名为happy
set_hostname() {
    log_info "设置主机名为happy..."
    
    # 检查当前主机名
    CURRENT_HOSTNAME=$(hostname)
    if [[ "$CURRENT_HOSTNAME" == "happy" ]]; then
        log_info "主机名已经是happy，无需修改"
    else
        log_info "当前主机名: $CURRENT_HOSTNAME"
        log_info "正在设置主机名为happy..."
        
        # 设置主机名
        hostnamectl set-hostname happy
        
        # 更新/etc/hosts文件
        if ! grep -q "happy" /etc/hosts; then
            echo "127.0.1.1 happy" >> /etc/hosts
        fi
        
        log_success "主机名已设置为happy"
        log_warning "注意：主机名更改将在下次重启后完全生效"
    fi
}

# 安装常用工具
install_tools() {
    log_info "检查常用工具安装状态..."
    
    # 定义需要安装的工具列表
    local tools=("vim" "wget" "git" "htop" "net-tools" "ufw")
    local missing_tools=()
    
    # 检查每个工具是否已安装
    for tool in "${tools[@]}"; do
        if dpkg -l | grep -q "^ii.*$tool"; then
            log_info "$tool 已安装"
        else
            log_info "$tool 未安装，添加到安装列表"
            missing_tools+=("$tool")
        fi
    done
    
    # 安装缺失的工具
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_info "安装缺失的工具: ${missing_tools[*]}"
        apt install -y "${missing_tools[@]}"
        log_success "工具安装完成"
    else
        log_success "所有常用工具已安装"
    fi
}

# 配置防火墙
configure_firewall() {
    log_info "配置防火墙..."
    
    # 检查防火墙状态
    if ufw status | grep -q "Status: active"; then
        log_info "防火墙当前已启用，正在关闭..."
        ufw disable
        log_success "防火墙已关闭"
    else
        log_info "防火墙当前已关闭"
    fi
    
    # 显示防火墙状态
    ufw status | tee -a "$LOG_FILE"
    log_warning "注意：防火墙已关闭，请确保在安全环境中使用"
}

# 创建Node.js项目目录
create_project_dir() {
    log_info "检查Node.js项目目录..."
    
    if [[ -d "/opt/nodejs-apps" ]]; then
        log_info "项目目录已存在: /opt/nodejs-apps"
    else
        log_info "创建Node.js项目目录..."
        mkdir -p /opt/nodejs-apps
        chmod 755 /opt/nodejs-apps
        log_success "项目目录创建完成: /opt/nodejs-apps"
    fi
}

# 创建系统信息脚本
create_system_info() {
    log_info "检查系统信息脚本..."
    
    if [[ -f "/opt/system-info.sh" ]]; then
        log_info "系统信息脚本已存在: /opt/system-info.sh"
        return 0
    fi
    
    log_info "创建系统信息脚本..."
    
    cat > /opt/system-info.sh << 'EOF'
#!/bin/bash
echo "=== 系统信息 ==="
echo "主机名: $(hostname)"
echo "完整主机名: $(hostname -f)"
echo "操作系统: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "内核版本: $(uname -r)"
echo "CPU信息: $(lscpu | grep 'Model name' | cut -d':' -f2 | xargs)"
echo "内存信息: $(free -h | grep Mem | awk '{print $2}')"
echo "磁盘使用: $(df -h / | tail -1 | awk '{print $5}')"
echo ""
echo "=== Node.js信息 ==="
echo "Node.js版本: $(node --version)"
echo "npm版本: $(npm --version)"
echo ""
echo "=== SSH密钥信息 ==="
echo "RSA公钥:"
cat /root/.ssh/id_rsa.pub
echo ""
echo "ED25519公钥:"
cat /root/.ssh/id_ed25519.pub
echo ""
echo "=== 网络信息 ==="
echo "IP地址:"
ip addr show | grep 'inet ' | grep -v '127.0.0.1'
echo ""
echo "=== 服务状态 ==="
systemctl status ssh --no-pager -l
echo ""
echo "=== 防火墙状态 ==="
ufw status
echo ""
echo "=== 主机名配置 ==="
echo "当前主机名: $(hostname)"
echo "hosts文件中的happy条目:"
grep -n "happy" /etc/hosts || echo "未找到happy条目"
EOF
    
    chmod +x /opt/system-info.sh
    log_success "系统信息脚本创建完成: /opt/system-info.sh"
}

# 创建Node.js示例应用
create_sample_app() {
    log_info "检查Node.js示例应用..."
    
    local app_dir="/opt/nodejs-apps/sample-app"
    
    # 检查应用是否已存在
    if [[ -d "$app_dir" && -f "$app_dir/package.json" && -f "$app_dir/app.js" ]]; then
        log_info "示例应用已存在: $app_dir"
        
        # 检查是否需要更新依赖
        if [[ -d "$app_dir/node_modules" ]]; then
            log_info "应用依赖已安装"
        else
            log_info "安装应用依赖..."
            cd "$app_dir"
            npm install
        fi
        
        log_success "示例应用检查完成"
        return 0
    fi
    
    log_info "创建Node.js示例应用..."
    
    mkdir -p "$app_dir"
    cd "$app_dir"
    
    # 创建package.json
    cat > package.json << 'EOF'
{
  "name": "sample-app",
  "version": "1.0.0",
  "description": "Sample Node.js application",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "node app.js"
  },
  "keywords": ["nodejs", "express"],
  "author": "System Admin",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2"
  }
}
EOF
    
    # 创建app.js
    cat > app.js << 'EOF'
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    message: 'Hello from Debian 11 Node.js App!',
    timestamp: new Date().toISOString(),
    hostname: require('os').hostname(),
    nodeVersion: process.version
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
  console.log(`Health check: http://0.0.0.0:${port}/health`);
});
EOF
    
    # 安装依赖
    log_info "安装应用依赖..."
    npm install
    
    log_success "Node.js示例应用创建完成: $app_dir"
    log_info "运行示例应用: cd $app_dir && npm start"
}

# 创建服务管理脚本
create_service_scripts() {
    log_info "检查服务管理脚本..."
    
    # 检查启动脚本
    if [[ -f "/opt/start-sample-app.sh" ]]; then
        log_info "启动脚本已存在: /opt/start-sample-app.sh"
    else
        log_info "创建启动脚本..."
        cat > /opt/start-sample-app.sh << 'EOF'
#!/bin/bash
cd /opt/nodejs-apps/sample-app
npm start
EOF
        chmod +x /opt/start-sample-app.sh
        log_success "启动脚本创建完成"
    fi
    
    # 检查systemd服务文件
    if [[ -f "/etc/systemd/system/sample-app.service" ]]; then
        log_info "systemd服务文件已存在"
        
        # 检查服务是否已启用
        if systemctl is-enabled sample-app.service &>/dev/null; then
            log_info "示例应用服务已启用"
        else
            log_info "启用示例应用服务..."
            systemctl enable sample-app.service
        fi
    else
        log_info "创建systemd服务文件..."
        cat > /etc/systemd/system/sample-app.service << 'EOF'
[Unit]
Description=Sample Node.js Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/nodejs-apps/sample-app
ExecStart=/usr/bin/node app.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
        
        # 重新加载systemd并启用服务
        systemctl daemon-reload
        systemctl enable sample-app.service
        log_success "systemd服务文件创建完成"
    fi
    
    log_success "服务管理脚本检查完成"
    log_info "启动服务: systemctl start sample-app"
    log_info "查看状态: systemctl status sample-app"
}

# 主函数
main() {
    log_info "=========================================="
    log_info "🚀 开始Debian 11 Node.js自动化配置..."
    log_info "📝 日志文件: $LOG_FILE"
    log_info "⏰ 开始时间: $(date)"
    log_info "=========================================="
    
    check_root
    set_hostname
    update_system
    install_nodejs
    configure_ssh
    configure_sshd
    install_tools
    configure_firewall
    create_project_dir
    create_system_info
    create_sample_app
    create_service_scripts
    
    log_success "=========================================="
    log_success "✅ 配置完成！"
    log_success "=========================================="
    log_info "系统已配置完成，请记录以下信息："
    log_info "1. 主机名已设置为: happy"
    log_info "2. SSH私钥已打印在日志中，请妥善保存"
    log_info "3. 密码登录已禁用，请使用SSH密钥登录"
    log_info "4. 防火墙已关闭（用于开发环境）"
    log_info "5. Node.js示例应用位于: /opt/nodejs-apps/sample-app"
    log_info "6. 系统信息脚本: /opt/system-info.sh"
    log_info "7. 示例应用服务: systemctl start sample-app"
    log_info "⏰ 结束时间: $(date)"
    
    # 显示最终的系统信息
    log_info "=== 最终系统信息 ==="
    /opt/system-info.sh | tee -a "$LOG_FILE"
    
    # 上传日志
    upload_log
}

# 上传日志到LogPaste
upload_log() {
    log_info "准备上传日志到LogPaste..."
    
    # 检查curl是否可用
    if ! command -v curl &> /dev/null; then
        log_error "curl未安装，无法上传日志"
        return 1
    fi
    
    # 创建日志摘要
    local log_summary=""
    log_summary+="=== Debian 11 Node.js 自动化配置日志 ===\n"
    log_summary+="时间: $(date)\n"
    log_summary+="主机名: $(hostname)\n"
    log_summary+="操作系统: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)\n"
    log_summary+="Node.js版本: $(node --version 2>/dev/null || echo '未安装')\n"
    log_summary+="npm版本: $(npm --version 2>/dev/null || echo '未安装')\n"
    log_summary+="SSH服务状态: $(systemctl is-active ssh 2>/dev/null || echo '未运行')\n"
    log_summary+="防火墙状态: $(ufw status | head -1 2>/dev/null || echo '未配置')\n"
    log_summary+="\n=== 完整日志 ===\n"
    
    # 读取日志文件内容
    if [[ -f "$LOG_FILE" ]]; then
        log_summary+="$(cat "$LOG_FILE")"
    else
        log_summary+="日志文件不存在: $LOG_FILE"
    fi
    
    # 上传到LogPaste
    log_info "正在上传日志..."
    local response
    response=$(echo -e "$log_summary" | curl -s -F "_=<-" "$LOG_UPLOAD_URL" 2>/dev/null)
    
    if [[ $? -eq 0 && "$response" =~ ^[a-zA-Z0-9]+$ ]]; then
        local log_url="$LOG_UPLOAD_URL/$response"
        log_success "日志上传成功！"
        log_success "日志链接: $log_url"
        echo ""
        echo "=========================================="
        echo "📋 配置完成！日志已上传到："
        echo "🔗 $log_url"
        echo "=========================================="
        echo ""
        
        # 保存日志链接到文件
        echo "$log_url" > "/tmp/debian11-setup-log-url.txt"
        log_info "日志链接已保存到: /tmp/debian11-setup-log-url.txt"
    else
        log_error "日志上传失败"
        log_info "日志文件位置: $LOG_FILE"
        return 1
    fi
}

# 执行主函数
main "$@" 