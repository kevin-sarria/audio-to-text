namespace CampoApi.Services;

public class SesionService
{
    // Sesión única: al iniciar una nueva se revocan todas las anteriores del usuario.
    public void IniciarSesion(Usuario usuario, string nuevaSesionId)
    {
        RevocarSesionesAnteriores(usuario);
        usuario.SesionActivaId = nuevaSesionId;
    }

    private void RevocarSesionesAnteriores(Usuario usuario)
    {
        usuario.SesionActivaId = null;
    }
}
