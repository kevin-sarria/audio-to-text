namespace CampoApi.Domain.Entities;

public abstract class Incidencia
{
    public int Id { get; set; }
    public TipoIncidencia Tipo { get; set; }
    public string Descripcion { get; set; } = string.Empty;
    public DateTime CreadaEn { get; set; } = DateTime.UtcNow;
}
