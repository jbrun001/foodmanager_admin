# README for Fund Tracker
This is the readme containing installation instructions for the Fund Tracker App.

# Initial Installation

These installation instructions are for deployment to a linux environment.

## Install process 

### node and modules

`sudo apt-get update`

`sudo apt install mysql-server`

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

`git clone https://github.com/jbrun001/APIProject`

`cd APIProject`

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

`LOCAL_DATABASE=portfolio`

`# this should be true if your system is live on a web server`

`LIVE_SYSTEM=true`

`# this is a complex string used as the session secret it can be anything but suggest it is complex and at least 30 chars`

`SESSION_SECRET=`

`# this is the session name - it can be anything but it is better that it doesn't identify your application`

`SESSION_NAME=`

`# this is the production URL on the live server do not include 
the / at the end`

`PRODUCTION_URL=https://doc.gold.ac.uk/usr/199`

`# this is your alphavantage API key`

`API_KEY_ALPHAVANTAGE=`

### MySQL

`sudo mysql`

`mysql> source ./SQLScripts/create_db_001.sql`

`mysql> source ./SQLScripts/insert_db_001.sql`

`mysql> quit`

`npm install dotenv mysql2 express express-session ejs bcrypt express-validator express-sanitizer request express-rate-limit csurf`

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

