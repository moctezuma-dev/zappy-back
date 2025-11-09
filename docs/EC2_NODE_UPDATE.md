# Actualizar Node.js en EC2 AWS

## Problema
Las dependencias de Supabase requieren Node.js >= 20.0.0, pero la instancia EC2 tiene Node.js v18.20.8.

## Solución: Usar NVM (Node Version Manager)

### Paso 1: Instalar NVM

```bash
# Descargar e instalar NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Recargar el perfil para que nvm esté disponible
source ~/.bashrc

# Verificar instalación
nvm --version
```

### Paso 2: Instalar Node.js 20 (LTS)

```bash
# Instalar Node.js 20 LTS
nvm install 20

# Usar Node.js 20 como versión por defecto
nvm use 20
nvm alias default 20

# Verificar versión
node --version
npm --version
```

### Paso 3: Reinstalar dependencias

```bash
# Ir al directorio del proyecto
cd /ruta/a/tu/proyecto

# Limpiar node_modules y package-lock.json (opcional pero recomendado)
rm -rf node_modules package-lock.json

# Reinstalar dependencias
npm install
```

## Alternativa: Usar NodeSource Repository

Si prefieres no usar NVM, puedes usar el repositorio de NodeSource:

```bash
# Instalar Node.js 20.x desde NodeSource
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Verificar versión
node --version
npm --version
```

## Verificar que todo funciona

```bash
# Verificar versión de Node.js
node --version  # Debe mostrar v20.x.x

# Verificar que npm funciona
npm --version

# Probar instalación de dependencias
npm install
```

## Notas importantes

1. **Si usas PM2 o similar**: Reinicia el proceso después de actualizar Node.js
   ```bash
   pm2 restart all
   # o
   pm2 delete all
   pm2 start src/server.js
   ```

2. **Si usas systemd**: Reinicia el servicio
   ```bash
   sudo systemctl restart tu-servicio
   ```

3. **Persistencia con NVM**: Si usas NVM, asegúrate de que el alias `default` esté configurado para que persista después de reiniciar.

## Solución rápida (si ya tienes NVM instalado)

```bash
nvm install 20
nvm use 20
nvm alias default 20
cd /ruta/a/tu/proyecto
rm -rf node_modules package-lock.json
npm install
```

