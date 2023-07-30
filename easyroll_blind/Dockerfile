FROM node:14-alpine

ENV LANG C.UTF-8

COPY easyroll_blind.js run.sh /

# Set the working directory
WORKDIR /share

# Install required packages using yarn
RUN apk add --no-cache yarn && \
    yarn install --frozen-lockfile --no-progress mqtt axios simple-node-logger || \
    (>&2 echo "Error: Yarn installation failed, falling back to npm..." && \
    npm install mqtt axios simple-node-logger)

# Make the run.sh script executable
RUN chmod a+x /run.sh

# Set the default command to run the script
CMD ["/run.sh"]
