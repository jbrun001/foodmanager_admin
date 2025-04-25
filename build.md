# run locally with node
```bash
node index.js
```
test

# build and run docker container locally
```bash
docker build --platform linux/amd64 -t foodmanager-admin .
docker run --platform=linux/amd64 -p 8080:8080 --env-file .env foodmanager-admin
```
test

# build push and deploy to google cloud

