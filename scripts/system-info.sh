#!/bin/bash

# 系统信息显示脚本
# 显示系统运行时间、网络信息、硬件使用情况等

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 获取系统运行时间（天数）
get_uptime() {
    local uptime_days=$(awk '{print int($1/86400)}' /proc/uptime 2>/dev/null || echo "0")
    echo "$uptime_days"
}

# 获取网络地址信息
get_network_info() {
    local ipv4="未知"
    local ipv6="未知"
    
    # 获取IPv4地址
    if command -v curl >/dev/null 2>&1; then
        ipv4=$(curl -s --max-time 3 ip.sb -4 2>/dev/null || echo "未知")
    fi
    
    # 获取IPv6地址
    if command -v curl >/dev/null 2>&1; then
        ipv6=$(curl -s --max-time 3 ip.sb -6 2>/dev/null || echo "未知")
    fi
    
    echo "$ipv4|$ipv6"
}

# 获取硬盘使用情况
get_disk_usage() {
    local disk_usage=$(df -h / | awk 'NR==2 {print $3 " / " $2}' 2>/dev/null || echo "未知 / 未知")
    echo "$disk_usage"
}

# 获取当前登录IP和地理位置
get_location_info() {
    local login_ip="未知"
    local location="未知"
    
    if command -v curl >/dev/null 2>&1; then
        login_ip=$(curl -s -4 --max-time 3 ifconfig.co 2>/dev/null || echo "未知")
        
        if [ "$login_ip" != "未知" ] && command -v jq >/dev/null 2>&1; then
            location=$(curl -s --max-time 3 "https://ipinfo.io/${login_ip}/json" 2>/dev/null | jq -r '.city + ", " + .region + ", " + .country' 2>/dev/null || echo "未知")
        fi
    fi
    
    echo "$login_ip|$location"
}

# 获取内存使用情况
get_memory_info() {
    local memory_info=$(free -h | awk 'NR==2 {printf "%s / %s (%.1f%%)", $3, $2, $3/$2*100}' 2>/dev/null || echo "未知 / 未知 (0.0%)")
    local swap_info=$(free -h | awk 'NR==3 {printf "%s / %s (%.1f%%)", $3, $2, $3/$2*100}' 2>/dev/null || echo "未知 / 未知 (0.0%)")
    
    echo "$memory_info|$swap_info"
}

# 获取系统负载
get_load_average() {
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' 2>/dev/null || echo "未知")
    echo "$load_avg"
}

# 获取CPU使用率
get_cpu_usage() {
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}' 2>/dev/null || echo "0")
    echo "$cpu_usage"
}

# 主函数
main() {
    # 获取各项信息
    local uptime_days=$(get_uptime)
    local network_info=$(get_network_info)
    local disk_usage=$(get_disk_usage)
    local location_info=$(get_location_info)
    local memory_info=$(get_memory_info)
    local load_avg=$(get_load_average)
    local cpu_usage=$(get_cpu_usage)
    
    # 解析网络信息
    local ipv4=$(echo "$network_info" | cut -d'|' -f1)
    local ipv6=$(echo "$network_info" | cut -d'|' -f2)
    
    # 解析位置信息
    local login_ip=$(echo "$location_info" | cut -d'|' -f1)
    local location=$(echo "$location_info" | cut -d'|' -f2)
    
    # 解析内存信息
    local mem_info=$(echo "$memory_info" | cut -d'|' -f1)
    local swap_info=$(echo "$memory_info" | cut -d'|' -f2)
    
    # 显示系统信息
    echo -e "${CYAN}---------------------------------${NC}"
    echo -e "${GREEN} _   _                         ${NC}"
    echo -e "${GREEN}| | | |                        ${NC}"
    echo -e "${GREEN}| |_| | __ _ _ __  _ __  _   _ ${NC}"
    echo -e "${GREEN}|  _  |/ _\` | '_ \\| '_ \\| | | |${NC}"
    echo -e "${GREEN}| | | | (_| | |_) | |_) | |_| |${NC}"
    echo -e "${GREEN}\\_| |_/\\__,_| .__/| .__/ \\__, |${NC}"
    echo -e "${GREEN}            | |   | |     __/ |${NC}"
    echo -e "${GREEN}            |_|   |_|    |___/ ${NC}"
    echo -e "${CYAN}---------------------------------${NC}"
    echo -e "${YELLOW}  运行时间:  ${NC}$uptime_days 天"
    echo -e "${YELLOW}  网络地址:  ${NC}$ipv4 / $ipv6"
    echo -e "${YELLOW}  当前登录IP:  ${NC}$login_ip"
    echo -e "${YELLOW}  地理位置:  ${NC}$location"
    echo -e "${YELLOW}  硬盘容量:  ${NC}$disk_usage"
    echo -e "${YELLOW}  内存: ${NC}$mem_info"
    echo -e "${YELLOW}  虚拟内存: ${NC}$swap_info"
    echo -e "${YELLOW}  系统负载: ${NC}$load_avg"
    echo -e "${YELLOW}  CPU使用率: ${NC}${cpu_usage}%"
    echo -e "${CYAN}-------------------------------------${NC}"
}

# 检查是否为交互式终端
if [ -t 0 ]; then
    # 交互式终端，显示彩色输出
    main
else
    # 非交互式终端，显示纯文本
    # 临时禁用颜色
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    PURPLE=''
    CYAN=''
    NC=''
    main
fi 