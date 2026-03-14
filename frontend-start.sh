#!/bin/sh
# Railway domain targets port 80
PORT=${PORT:-80}
cat > /etc/nginx/conf.d/default.conf << EOF
server {
    listen ${PORT};
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
exec nginx -g 'daemon off;'
