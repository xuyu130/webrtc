#!/usr/bin/env bash
conda activate xyf
docker-compose down || true
docker-compose up -d