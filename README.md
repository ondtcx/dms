<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

````bash
$ npm install

# 🌱 Seed de Base de Datos

Este proyecto utiliza Prisma Seed para poblar la base de datos con datos iniciales, incluyendo el usuario administrador.

## Prerequisitos

Asegúrate de tener instaladas las siguientes dependencias:
```bash
npm install -D ts-node @types/node
npm install dotenv
````

## Configuración

### 1. Variables de Entorno

Crea o actualiza tu archivo `.env` con las credenciales del administrador:

```env
# Base de datos
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"

# JWT
JWT_SECRET="tu-secreto-jwt"

# Credenciales del Admin (para seed)
ADMIN_EMAIL="admin@miempresa.com"
ADMIN_PASSWORD="Admin123!"
ADMIN_NAME="Administrador Principal"

# Entorno
NODE_ENV="development"
```

### 2. Archivo de Seed

El archivo de seed se encuentra en `prisma/seed.ts` y crea:

- ✅ Un usuario administrador (ADMIN)
- ✅ Usuarios de prueba (solo en desarrollo)

## Ejecución del Seed

### Opción 1: Comando directo (Recomendado)

```bash
npx prisma db seed
```

### Opción 2: Script de npm

```bash
npm run seed
```

### Opción 3: Con reset de base de datos

⚠️ **ADVERTENCIA:** Esto eliminará todos los datos existentes.

```bash
npx prisma migrate reset
```

Este comando ejecuta:

1. Elimina la base de datos
2. Crea una nueva base de datos
3. Ejecuta todas las migraciones
4. Ejecuta el seed automáticamente

## Verificación

Después de ejecutar el seed, deberías ver un mensaje como:

```
🌱 Iniciando seed...
✅ Admin creado: {
  id: 1,
  email: 'admin@miempresa.com',
  role: 'ADMIN'
}
✅ Usuario de prueba creado: {
  id: 2,
  email: 'user@example.com'
}
🎉 Seed completado!
```

## Login con el Admin

Una vez creado el administrador, puedes iniciar sesión:

```bash
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "email": "admin@miempresa.com",
  "password": "Admin123!"
}
```

**Respuesta:**

```json
{
  "user": {
    "id": 1,
    "email": "admin@miempresa.com",
    "name": "Administrador Principal",
    "role": "ADMIN",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## Usuarios Creados por Defecto

| Email                 | Password    | Rol   | Entorno          |
| --------------------- | ----------- | ----- | ---------------- |
| `admin@miempresa.com` | `Admin123!` | ADMIN | Todos            |
| `user@example.com`    | `User123!`  | USER  | Solo Development |

## Personalización

### Cambiar credenciales del admin

Edita las variables de entorno en `.env`:

```env
ADMIN_EMAIL="tu-email@empresa.com"
ADMIN_PASSWORD="TuPasswordSegura123!"
ADMIN_NAME="Tu Nombre"
```

Y vuelve a ejecutar:

```bash
npx prisma db seed
```

### Agregar más usuarios iniciales

Edita `prisma/seed.ts` y agrega más usuarios en la función `main()`:

```typescript
const moderator = await prisma.user.upsert({
  where: { email: 'moderator@example.com' },
  update: {},
  create: {
    email: 'moderator@example.com',
    password: await bcrypt.hash('Moderator123!', 10),
    name: 'Moderador',
    role: UserRole.MODERATOR,
  },
});
```

## Solución de Problemas

### Error: "Usuario ya existe"

Si el usuario admin ya existe, el seed no lo duplicará gracias a `upsert`. Para recrearlo:

```bash
# Eliminar usuario existente en Prisma Studio
npx prisma studio

# O resetear completamente la BD
npx prisma migrate reset
```

### Error: "Cannot find module 'bcrypt'"

```bash
npm install bcrypt
npm install -D @types/bcrypt
```

### Error: "Cannot find module 'ts-node'"

```bash
npm install -D ts-node @types/node
```

## Uso en Producción

### Opción 1: Ejecutar manualmente

```bash
# En el servidor de producción
NODE_ENV=production npx prisma db seed
```

### Opción 2: En el despliegue automático

Agrega el comando al script de deploy:

```json
{
  "scripts": {
    "deploy": "prisma migrate deploy && prisma db seed"
  }
}
```

### Opción 3: Solo en primera instalación

```bash
# Ejecutar solo si no existe ningún admin
npx prisma db seed
```

## Seguridad

⚠️ **IMPORTANTE:**

- Cambia la contraseña del admin inmediatamente después del primer login en producción
- No uses contraseñas por defecto en producción
- Mantén las credenciales en variables de entorno, nunca en el código
- Agrega `.env` a `.gitignore`

```gitignore
# .gitignore
.env
.env.local
.env.production
```

## Comandos Útiles

```bash
# Ver base de datos en navegador
npx prisma studio

# Verificar estado de migraciones
npx prisma migrate status

# Crear nueva migración
npx prisma migrate dev --name nombre_migracion

# Regenerar cliente de Prisma
npx prisma generate

# Ejecutar seed
npx prisma db seed

# Reset completo (⚠️ elimina todos los datos)
npx prisma migrate reset
```

## Referencias

- [Documentación de Prisma Seed](https://www.prisma.io/docs/guides/database/seed-database)
- [Prisma Client API](https://www.prisma.io/docs/concepts/components/prisma-client)

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest
