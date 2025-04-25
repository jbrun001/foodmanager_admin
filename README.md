# README for food manager admin

foodmanager_admin is the admin interface for foodmanger. It is written in node.js and is designed to be deployed in a docker container, because it uses puppeteer which requires chromium to be installed. The dockerfile contains all the image details and additional requirements.

the node modules used in this project are (for local development)
```bash
npm install dotenv firebase firebase-admin express express-session ejs bcrypt express-validator express-sanitizer request express-rate-limit csurf string-similarity google-auth-library puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
```

# Container deploy using docker instructions

# Google Cloud Run Deployment

This guide covers build,  start, stop this app when using docker. Google Cloud Run using Artifact Registry, this has been tested from Apple Silicon.

---

## Prerequisites

- Google Cloud project ID: `foodmanager-f117f`
- Artifact Registry repo: `docker-repo` in region `europe-west2`
- App name: `foodmanager-admin`
- Docker & `gcloud` CLI installed
- Docker supports `buildx` 

---

## To build and run locally for testing
```bash
docker build --platform linux/amd64 -t foodmanager-admin .
docker run --platform=linux/amd64 -p 8080:8080 --env-file .env foodmanager-admin
```
note .env is used locally and .envgooglecloudrun.yaml is used when depolying to google cloud
different format for the same data
localhost:8080
---

## To stop running locally
```bash
docker ps -q --filter ancestor=foodmanager-admin | xargs docker stop
```
---


## Build & Push Docker Image (Apple Silicon Safe)

Build for `linux/amd64` (required for Cloud Run) and push directly to Artifact Registry:

```bash
docker buildx build --platform linux/amd64 \
  -t europe-west2-docker.pkg.dev/foodmanager-f117f/docker-repo/foodmanager-admin . \
  --push
```
---

## Deploy to Google Cloud Run

Deploy the image from Artifact Registry:

```bash
gcloud run deploy foodmanager-admin \
  --image europe-west2-docker.pkg.dev/foodmanager-f117f/docker-repo/foodmanager-admin \
  --region europe-west2 \
  --platform managed \
  --allow-unauthenticated \
  --env-vars-file .env-googlecloudrun.yaml
```


---

## Stop / Delete the Cloud Run Service

```bash
gcloud run services delete foodmanager-admin \
  --region=europe-west2
```

This **does not** delete the Docker image from Artifact Registry.

---

## Optional: Remove Local Docker Image

Free up local disk space:

```bash
docker image rm europe-west2-docker.pkg.dev/foodmanager-f117f/docker-repo/foodmanager-admin
```

---

## Re-authenticate or Switch Config 

```bash
gcloud auth login
gcloud config set project foodmanager-f117f
gcloud auth configure-docker europe-west2-docker.pkg.dev
```

---

## View Logs (Cloud Run)

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=foodmanager-admin" \
  --project=foodmanager-f117f --limit=50 --format="value(textPayload)"
```
