# Local stand-in for Azure Web PubSub: Microsoft's official emulator (a .NET global tool).
# Dev/test only. In Azure the app talks to the real service instead.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG EMULATOR_VERSION=1.0.0-beta.1
RUN dotnet tool install --tool-path /tools Microsoft.Azure.WebPubSub.Emulator --version ${EMULATOR_VERSION}

FROM mcr.microsoft.com/dotnet/aspnet:10.0
ENV DOTNET_ROOT=/usr/share/dotnet
COPY --from=build /tools /tools
WORKDIR /emulator
COPY appsettings.json ./
EXPOSE 8080
CMD ["/tools/awps-emulator", "--urls", "http://0.0.0.0:8080"]
