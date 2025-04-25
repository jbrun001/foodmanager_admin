FROM node:23-slim
#FROM node:20-slim - has high security vulnerabilities

# set working directory
WORKDIR /app

# copy the app files (.dockerignore stops node_modules being copied)
COPY . .

# install app dependencies - this will look in package.json for these and install them
RUN npm install --production

# open the port we want
ENV PORT=8080
EXPOSE 8080

# start the app
CMD ["node", "index.js"]
