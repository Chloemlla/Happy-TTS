import subprocess

# 转换 fullchain.pem 到 server.crt
subprocess.run(['openssl', 'x509', '-in', 'fullchain.pem', '-out', 'server.crt'])

# 转换 privkey.pem 到 server.key
subprocess.run(['openssl', 'rsa', '-in', 'privkey.pem', '-out', 'server.key'])

print("Conversion completed.")