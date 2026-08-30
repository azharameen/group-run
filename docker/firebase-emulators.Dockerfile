# Local Firebase emulators image (auth + firestore).
# The official ghcr.io/firebase/firebase-tools image is unavailable (registry
# denied), so build locally: Node (firebase CLI) + Temurin 21 JRE (emulators).
FROM eclipse-temurin:21-jre AS jdk

FROM node:24-slim
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"

RUN npm install -g firebase-tools

WORKDIR /workspace
CMD ["firebase", "emulators:start", "--only", "auth,firestore", "--project", "demo-companion-auth"]
