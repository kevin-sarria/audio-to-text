using Microsoft.AspNetCore.Mvc;
using BackendApi.Models.Entities;

namespace BackendApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CostCentersController : ControllerBase
{
    [HttpGet]
    public IActionResult GetAll()
    {
        return Ok(new List<CostCenter>());
    }
}
