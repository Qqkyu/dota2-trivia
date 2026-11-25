# Runs scripts/check-native-feedback-sounds.mjs on hosts without PulseAudio.
# Google's current stable Chrome, as on a player's PC. See docs/feedback-sounds.md.
FROM node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl gnupg pulseaudio pulseaudio-utils \
    && curl --fail --silent --show-error --location https://dl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor --output /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install --yes --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*
# Chrome's own sandbox needs privileges that this container drops. It only opens the local app.
RUN printf '#!/bin/sh\nexec /usr/bin/google-chrome --no-sandbox "$@"\n' > /usr/local/bin/container-chrome \
    && chmod 755 /usr/local/bin/container-chrome
ENV CHROME_BIN=/usr/local/bin/container-chrome
USER node
WORKDIR /app
