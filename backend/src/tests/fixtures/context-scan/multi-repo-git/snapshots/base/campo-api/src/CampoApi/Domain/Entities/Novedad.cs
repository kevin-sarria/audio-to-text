namespace CampoApi.Domain.Entities;

public class Novedad : Incidencia
{
    public int TecnicoId { get; set; }
    public string? FotoUrl { get; set; }
}
