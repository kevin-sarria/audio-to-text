namespace CampoApi.Domain.Entities;

public class Usuario
{
    public int Id { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public Rol Rol { get; set; }
    public string? SesionActivaId { get; set; }
}
