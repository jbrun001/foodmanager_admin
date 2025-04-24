# README for food manager admin

# container deploy using docker

# Google Cloud Run Deployment Guide (Apple Silicon Compatible)

This guide covers everything too **build**, **start**, and **stop** this app when using docker app  **Google Cloud Run** using **Artifact Registry**, this is tailored for **Apple Silicon** users.

---

## Prerequisites

- Google Cloud project ID: `foodmanager-f117f`
- Artifact Registry repo: `docker-repo` in region `europe-west2`
- App name: `foodmanager-admin`
- Docker & `gcloud` CLI installed
- Docker supports `buildx` 

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

## Re-authenticate or Switch Config (if needed)

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




# local install
This is the readme containing installation instructions 

# Initial Installation
These installation instructions are for deployment to a linux environment.

## Install process 

### node and modules

`sudo apt-get update`

`sudo apt install nodejs`

`sudo apt install npm`

`wget https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh`

`bash ./install.sh`

disconnect and log back in

`nvm install v16.17.0`

`node --version` 

`sudo apt install git`

`mkdir project`

`cd project`

`git clone https://github.com/jbrun001/foodmanager_admin`

`cd foodmanager_admin`

`npm init`

### .env configuration file
use nano to create .env file (contains security details so not synced with git) the required entries in the .env file are listed below

`# this should be true if you are hosting the database locally i.e. localhost`

`LOCAL_DB=true`

`# this is the name of the local database (localhost)`
`LOCAL_HOST=localhost`

`# this is the database user with access to just the portfolio database this MUST BE ENTERED`

`LOCAL_USER=`
`# this is the password for the user above  MUST BE ENTERED`
`LOCAL_PASSWORD=`

`# this is the name of the database for the app - don't change this`

`LOCAL_DATABASE=`

`# this should be true if your system is live on a web server`

`LIVE_SYSTEM=true`

`# this is a complex string used as the session secret it can be anything but suggest it is complex and at least 30 chars`

`SESSION_SECRET=`

`# this is the session name - it can be anything but it is better that it doesn't identify your application`

`SESSION_NAME=`

`# this is the production URL on the live server do not include 
the / at the end`

`PRODUCTION_URL=https://doc.gold.ac.uk/usr/199`


`npm install dotenv firebase firebase-admin express express-session ejs bcrypt express-validator express-sanitizer request express-rate-limit csurf string-similarity google-auth-library`

### forever

`sudo apt install -g forever`

`forever start index.js`

to stop the application

`forever stop index.js`

# hardware and software requirements

Disk for install of libraries and dependencies: 1Gb - this may vary depending on your target platform treat this as a minimum.

Disk for application code: 100Mib

O/S: Ubuntu 18.04.6 LTS or higher 

Architecture: x86_64 (64-bit support required)

Processor: Intel Core Processor, Broadwell generation or later

Cores: At least 1 core (Note: More cores are recommended for improved performance)

Threads per Core: At least 1

Virtualization Support: If running in a virtualized environment, a hypervisor supporting full virtualization (e.g., KVM) is required.

CPU Frequency: Minimum 2.0 GHz 

Cache: Minimum L1 cache of 32K for data and 32K for instructions, L2 cache of 4096K (4MB)

Memory: minimum 512MB (for O/S and just this application running)

