# Guia de acceso, registro e invitaciones

Esta guia explica como entrar a la web app y que diferencia hay entre
registrarse y aceptar una invitacion.

## Idea principal

Registrarse crea tu cuenta de usuario. Aceptar una invitacion agrega esa cuenta
a una banda.

No son exactamente lo mismo. Una persona puede tener cuenta y todavia no
pertenecer a ninguna banda. Para ver el repertorio de una banda compartida,
ademas de tener cuenta, tiene que aceptar el link de invitacion de esa banda.

## Si recibiste una invitacion

1. Abri el link de invitacion que te mando un admin.
   El link tiene este formato:

   ```text
   https://la-app.example/invite/<token>
   ```

2. Si la app te pide entrar, usa el email al que te enviaron la invitacion.
   Esto es importante: la invitacion queda asociada a ese email.

3. Si ya tenes cuenta, elegi **Ingresar** y completa email y contrasena.

4. Si todavia no tenes cuenta, elegi **Registrarse**, crea una contrasena y
   confirma el email si Supabase te envia un correo de confirmacion.

5. Al volver a la app, deberias llegar otra vez a la invitacion. Toca
   **Aceptar**.

6. Cuando la invitacion se acepta correctamente, la app te lleva al repertorio
   de la banda.

## Si ya te registraste pero no aceptaste la invitacion

Si creaste la cuenta entrando por `/register` o `/sign-up`, eso solo crea el
usuario. Para sumarte a una banda todavia falta aceptar la invitacion.

Tenes dos caminos:

1. Abri de nuevo el link de invitacion.
2. O entra a la app y, si aparece la pantalla de bienvenida, pega el link o el
   token en **Unirme con invitacion**.

Despues toca **Aceptar** en la pantalla de invitacion.

## Si entraste sin invitacion

Si no tenes invitacion y no perteneces a ninguna banda, la app te lleva a la
pantalla de bienvenida. Desde ahi podes:

- Crear una banda nueva. En ese caso quedas como admin.
- Pegar un link o token de invitacion para unirte a una banda existente.

## Para admins: como invitar a alguien

1. Entra a la banda.
2. Abri **Ajustes de banda**.
3. Entra a la pestana **Miembros**.
4. En **Invitaciones**, escribe el email de la persona.
5. Elegi el rol:
   - **Miembro**: puede usar y editar el repertorio.
   - **Admin**: tambien puede gestionar miembros, invitaciones y ajustes.
6. Toca **Generar invitacion**.
7. Copia el link generado y envialo a la persona por el canal que prefieras.

La app genera el link, pero no envia el email automaticamente.

## Cosas a tener en cuenta

- La persona invitada debe registrarse o ingresar con el mismo email usado al
  generar la invitacion.
- Los links de invitacion caducan a los 7 dias.
- Si ya estas logueado con otra cuenta y queres aceptar una invitacion para un
  email distinto, cerra sesion primero y entra con el email correcto.
- Si aparece un error al aceptar, revisa que el link este completo, que no haya
  vencido y que la cuenta sea la del email invitado.

## Resumen rapido

- **Ingresar**: usar una cuenta que ya existe.
- **Registrarse**: crear una cuenta nueva.
- **Aceptar invitacion**: unir esa cuenta a una banda.
- Para entrar a una banda compartida necesitas las dos cosas: una cuenta y una
  invitacion aceptada.
