# AGENTS.md

This document provides guidelines for agentic coding assistants working on this NestJS Document Management System (DMS) codebase.

## Commands

### Development

- `npm run start:dev` - Start server in watch mode
- `npm run start:debug` - Start server with debugging
- `npm run build` - Build the project

### Testing

- `npm run test` - Run all unit tests
- `npm run test:e2e` - Run all e2e tests
- `npm run test:cov` - Generate test coverage
- `npm run test:watch` - Watch mode for tests
- `npm run test -- <path-to-spec>` - Run single test file (e.g., `npm run test -- auth/auth.service.spec.ts`)
- `npm run test -- --testNamePattern="<test-name>"` - Run specific test by name

### Code Quality

- `npm run lint` - Run ESLint and auto-fix issues
- `npm run format` - Format code with Prettier

### Database

- `npm run seed` - Seed database with initial data
- `npx prisma migrate dev` - Create and apply migration
- `npx prisma migrate reset` - Reset database and reseed
- `npx prisma studio` - Open Prisma Studio
- `npx prisma generate` - Regenerate Prisma Client

## Code Style Guidelines

### Imports

- Group imports in order: 1) NestJS imports, 2) Third-party imports, 3) Local imports
- Use absolute paths for local imports from `src` (e.g., `src/user/user.service`)
- Keep imports organized alphabetically within groups

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
```

### Formatting

- Use **single quotes** for strings
- Use **trailing commas** for objects, arrays, and function parameters
- Semicolons required
- 2-space indentation
- Line length should be reasonable (not exceed 120 characters)

### TypeScript Configuration

- `strictNullChecks: false`, `noImplicitAny: false` - Type flexibility allowed
- Use `@prisma/client` types directly for database models
- Use `Omit<User, 'password'>` to exclude sensitive fields from return types
- Decorators enabled for NestJS (`experimentalDecorators: true`)

### Naming Conventions

- **Classes**: PascalCase (e.g., `AuthController`, `UserService`)
- **Methods**: camelCase (e.g., `findAll`, `createUser`)
- **Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE (rarely used)
- **Files**: kebab-case (e.g., `auth.service.ts`, `create-user.dto.ts`)
- **DTOs**: PascalCase with `Dto` suffix (e.g., `LoginDto`, `RegisterDto`)
- **Guards**: PascalCase with `Guard` suffix (e.g., `AuthGuard`, `RolesGuard`)
- **Decorators**: PascalCase (e.g., `CurrentUser`, `Public`)

### NestJS Patterns

#### Controllers

- Use `@ApiTags()` decorator for Swagger grouping
- Use `@ApiOperation()` to describe endpoints in Spanish
- Use `@ApiResponse()` for success and error cases
- Use `@ApiBearerAuth('JWT-auth')` for authenticated endpoints
- Use `@Public()` decorator for public endpoints (no authentication)
- Use `@CurrentUser()` custom decorator to access logged-in user

```typescript
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
```

#### Services

- Mark with `@Injectable()` decorator
- Inject dependencies via constructor
- Return Prisma types or DTOs
- Handle errors with NestJS exceptions (`NotFoundException`, `UnauthorizedException`, `ConflictException`)

```typescript
@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { password, ...result } = user;
    return result;
  }
}
```

#### DTOs

- Use `class-validator` decorators for validation
- Use `@ApiProperty()` from `@nestjs/swagger` for documentation
- Include example values in `@ApiProperty()`
- Use partial DTOs for updates (all fields optional)

```typescript
export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
```

#### Guards

- Implement `CanActivate` interface
- Use `@Injectable()` decorator
- For authentication: Verify JWT, attach user to `request['user']`
- For authorization: Check user roles using `@Roles()` decorator

#### Modules

- Import necessary modules (e.g., `UserModule`, `JwtModule`)
- Register providers, controllers, and exports
- Use `ConfigModule.forRoot({ isGlobal: true })` in AppModule

### Error Handling

- Use NestJS built-in exceptions: `NotFoundException`, `UnauthorizedException`, `ConflictException`, `BadRequestException`
- Return descriptive error messages in Spanish when possible
- Validation errors from class-validator are handled automatically by `ValidationPipe`

### Database Patterns

- Use `PrismaService` for all database operations
- Always exclude `password` field when returning user data: `Omit<User, 'password'>`
- Use `select` for partial field selection in Prisma queries
- Use `@Prisma/client` types for type safety

### Testing

#### Unit Tests (`*.spec.ts`)

- Located alongside source files (e.g., `auth/auth.service.spec.ts`)
- Use `Test.createTestingModule` from `@nestjs/testing`
- Mock dependencies like services or PrismaService
- Test file name: `<service>.spec.ts`

```typescript
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

#### E2E Tests (`*.e2e-spec.ts`)

- Located in `test/` directory
- Use `supertest` for HTTP requests
- Test file name: `<module>.e2e-spec.ts`
- Test against real endpoints

```typescript
describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/auth/login (POST)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'Password123!' })
      .expect(200);
  });
});
```

### Global Configuration

- API prefix: `/api` (set in `main.ts`)
- Swagger docs: `/api/docs`
- CORS enabled for `http://localhost:3000`
- Global ValidationPipe with `whitelist: true` and `forbidNonWhitelisted: true`
- JWT secret and expiration loaded from environment variables

### Environment Variables

Required in `.env`:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `JWT_EXPIRATION` - Token expiration (default: '7d')
- `PORT` - Server port (default: 3000)

### Additional Notes

- Use helpers from `src/common/helpers/` for common transformations (e.g., `toBoolean`)
- API documentation is in Spanish (`summary`, `description` fields)
- Passwords hashed with `bcrypt` (10 rounds)
- User roles: `USER`, `ADMIN`
- File uploads stored in `uploads/` directory
- Static files served at `/files` endpoint
