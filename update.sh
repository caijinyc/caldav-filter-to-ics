#!/bin/bash

# 进入项目目录
cd ~/caldav-filter-to-ics/

# 拉取最新代码
git pull origin main

# 检查是否有文件变更，如果有则重启 PM2 服务
if [[ `git diff --name-only` != "" ]]; then
  pm2 restart server-version
fi